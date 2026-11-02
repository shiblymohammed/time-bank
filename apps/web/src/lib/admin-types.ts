export type Field = {
  key: string;
  label: string;
  value?: string;
  options?: string[];
  choices?: { value: string; label: string }[];
  optional?: boolean;
  type?: string;
  pattern?: string;
  min?: string;
  max?: string;
  step?: string;
  minLength?: number;
  maxLength?: number;
};
export type Action = {
  title: string;
  description?: string;
  /** Text on the confirm button; defaults to "Save". */
  submitLabel?: string;
  fields: Field[];
  submit: (values: Record<string, string>) => Promise<unknown>;
  successMessage?: (result: unknown) => string;
};
