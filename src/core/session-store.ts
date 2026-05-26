export interface Session {
  customerSlug: string;
  customerName: string;
  startedAt: string;
  owner?: string;
}

let activeSession: Session | null = null;

export function setSession(s: Session): void {
  activeSession = s;
}

export function getSession(): Session | null {
  return activeSession;
}

export function clearSession(): void {
  activeSession = null;
}
