import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const files = {
  linkedinPost: "../fixtures/socials/linkedin/post.json",
  instagramContainer: "../fixtures/socials/instagram/container.json",
  tikTokUser: "../fixtures/socials/tiktok/user.json",
  tikTokVideos: "../fixtures/socials/tiktok/videos.json",
} as const;

export function socialFixture(name: keyof typeof files): unknown {
  return JSON.parse(readFileSync(fileURLToPath(new URL(files[name], import.meta.url)), "utf8"));
}
