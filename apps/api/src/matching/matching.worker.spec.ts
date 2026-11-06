import { ConfigService } from '@nestjs/config';
import { MatchingService } from './matching.service';
import { MatchingWorker } from './matching.worker';

describe('MatchingWorker', () => {
  const matching = {
    findRequestsDueForProgression: jest.fn(),
    evaluateRoundProgression: jest.fn(),
  };
  const worker = () =>
    new MatchingWorker(matching as unknown as MatchingService, new ConfigService());

  beforeEach(() => jest.resetAllMocks());

  it('advances every due request in its own organization', async () => {
    matching.findRequestsDueForProgression.mockResolvedValue([
      { id: 'request-1', organizationId: 'org-1' },
      { id: 'request-2', organizationId: 'org-2' },
    ]);

    await worker().tick();

    expect(matching.evaluateRoundProgression).toHaveBeenCalledWith('org-1', 'request-1');
    expect(matching.evaluateRoundProgression).toHaveBeenCalledWith('org-2', 'request-2');
  });

  it('carries on when one request fails', async () => {
    jest.spyOn(console, 'error').mockImplementation();
    matching.findRequestsDueForProgression.mockResolvedValue([
      { id: 'request-1', organizationId: 'org-1' },
      { id: 'request-2', organizationId: 'org-1' },
    ]);
    matching.evaluateRoundProgression.mockRejectedValueOnce(new Error('locked'));

    await expect(worker().tick()).resolves.toBeUndefined();

    expect(matching.evaluateRoundProgression).toHaveBeenCalledTimes(2);
  });

  it('does not start a run while the last one is still going', async () => {
    let finish = () => {};
    matching.findRequestsDueForProgression.mockReturnValue(
      new Promise<never[]>((resolve) => {
        finish = () => resolve([]);
      }),
    );
    const running = worker();

    const first = running.tick();
    await running.tick();
    finish();
    await first;

    expect(matching.findRequestsDueForProgression).toHaveBeenCalledTimes(1);
  });

  it('stays off when background workers are disabled', () => {
    const interval = jest.spyOn(global, 'setInterval');
    new MatchingWorker(
      matching as unknown as MatchingService,
      new ConfigService({ BACKGROUND_WORKERS_ENABLED: 'false' }),
    ).onApplicationBootstrap();

    expect(interval).not.toHaveBeenCalled();
    interval.mockRestore();
  });
});
