import {UserRole} from "../../util";

export const ROLE_MAP: Record<string, string[]> = {
  "POST /auth/change-password": [UserRole.USER, UserRole.ADMIN],
  "GET /auth/me": [UserRole.USER, UserRole.ADMIN],
  "POST /create-room": [UserRole.USER],
  "GET /jira/stories": [UserRole.USER],
  "GET /jira/projects": [UserRole.USER],
  "GET /rooms": [UserRole.USER, UserRole.ADMIN],
  "GET /rooms/{roomId}/stories": [UserRole.USER, UserRole.ADMIN],
  "GET /rooms/{roomId}/stories/{storyId}/votes": [UserRole.USER, UserRole.ADMIN],
  "POST /story/ai-estimate": [UserRole.USER],
  "GET /users": [UserRole.ADMIN],
  "GET /users/me/avatar/upload-url": [UserRole.USER, UserRole.ADMIN],
  "PUT /users/jira-token": [UserRole.USER],
  "PUT /users/ban": [UserRole.ADMIN],

  "$connect": [UserRole.USER]
}
