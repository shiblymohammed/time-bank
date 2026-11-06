import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

export interface PushMessage {
  title: string;
  body: string;
  data: Record<string, string>;
}

export interface PushResult {
  delivered: number;
  /** Tokens Firebase no longer recognises; the app was removed or reinstalled. */
  staleTokens: string[];
  error?: string;
}

const STALE_TOKEN_CODES = [
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
];

/** Sends through Firebase Cloud Messaging, which unlike sign-in needs a service account. */
@Injectable()
export class PushSender {
  private readonly credentials?: string;

  constructor(config: ConfigService) {
    const credentials = config.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON')?.trim();
    if (credentials) this.credentials = credentials;
  }

  get configured() {
    return Boolean(this.credentials);
  }

  private app(): App {
    const name = 'time-bank-push';
    return (
      getApps().find((candidate) => candidate.name === name) ??
      initializeApp({ credential: cert(JSON.parse(this.credentials!)) }, name)
    );
  }

  async send(tokens: string[], message: PushMessage): Promise<PushResult> {
    const result = await getMessaging(this.app()).sendEachForMulticast({
      tokens,
      notification: { title: message.title, body: message.body },
      data: message.data,
      android: { priority: 'high' },
    });
    const staleTokens: string[] = [];
    let error: string | undefined;
    result.responses.forEach((response, index) => {
      const code = response.error?.code;
      if (code && STALE_TOKEN_CODES.includes(code)) staleTokens.push(tokens[index]!);
      else if (code) error = code;
    });
    return { delivered: result.successCount, staleTokens, ...(error ? { error } : {}) };
  }
}
