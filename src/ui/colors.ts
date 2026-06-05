import ansis from "ansis";

export const success = (s: string): string => ansis.green(s);
export const error = (s: string): string => ansis.red(s);
export const warning = (s: string): string => ansis.yellow(s);
export const info = (s: string): string => ansis.cyan(s);
export const bold = (s: string): string => ansis.bold(s);
