export interface CreateStoryRequest {
    action: string;
    roomId: string;
    name: string;
    description: string;
    issueKey?: string;
}
