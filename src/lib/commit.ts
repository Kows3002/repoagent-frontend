export const DEFAULT_COMMIT_MESSAGE = "RepoAgent: Apply requested changes";
export const MAX_COMMIT_MESSAGE_LENGTH = 200;

export function getCommitMessageError(message: string): string | null {
  if (!message.trim()) return "Enter a commit message before pushing.";
  if (/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(message)) {
    return "Use a single line without control characters.";
  }
  if ([...message.trim()].length > MAX_COMMIT_MESSAGE_LENGTH) {
    return `Keep the commit message to ${MAX_COMMIT_MESSAGE_LENGTH} characters or fewer.`;
  }
  return null;
}
