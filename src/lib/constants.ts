export const TEMPLATES = ["classic", "modern"] as const;
export type TemplateId = (typeof TEMPLATES)[number];
