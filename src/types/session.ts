export interface SessionUser {
  readonly id: string;
  readonly email: string | null;
  readonly name: string | null;
  readonly avatarUrl: string | null;
}
