export interface IUserPayload {
  id: string
  email: string
  name: string
  avatarUrl?: string | null
}

declare global {
  namespace Express {
    interface Request {
      user?: IUserPayload
    }
  }
}
