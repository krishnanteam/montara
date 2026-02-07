import { WebClient } from "@slack/web-api";

let cachedClient: WebClient | null = null;

export function getSlackClient(token: string): WebClient {
  if (!cachedClient) {
    cachedClient = new WebClient(token);
  }
  return cachedClient;
}

export async function resolveUserName(
  client: WebClient,
  userId: string
): Promise<string> {
  try {
    const result = await client.users.info({ user: userId });
    return result.user?.real_name || result.user?.name || userId;
  } catch {
    return userId;
  }
}

export async function downloadSlackFile(
  token: string,
  url: string
): Promise<Buffer> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}
