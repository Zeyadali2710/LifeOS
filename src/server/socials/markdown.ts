import { isPublicHttpsImageUrl } from "@/lib/social-types";

export function portfolioMarkdown(input: { title: string; text: string; date: string; imageUrl?: string | null }): string {
  if (!input.title.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("Portfolio title and date are required.");
  if (input.imageUrl && !isPublicHttpsImageUrl(input.imageUrl)) throw new Error("Image URL must be public HTTPS.");
  const frontMatter = [`title: ${JSON.stringify(input.title.trim())}`, `date: ${input.date}`];
  if (input.imageUrl) frontMatter.push(`image: ${JSON.stringify(input.imageUrl)}`);
  return `---\n${frontMatter.join("\n")}\n---\n\n${input.text.trim()}\n`;
}
