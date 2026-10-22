"use client";

import Image from "next/image";
import { useState } from "react";
import { isPublicHttpsImageUrl, type SocialPlatform } from "@/lib/social-types";
import { Avatar, LabelPill, Status, Tag, type Tone } from "@/ui/display";
import { Icon } from "@/ui/icon";
import { PLATFORM } from "./platform";
import s from "./socials.module.css";

export function PostStatus({ status, pill = false }: { status: string; pill?: boolean }) {
  const states: Record<string, [Tone, string, string]> = {
    draft: ["idle", "–", "Draft"], pending_approval: ["approval", "!", "Awaiting approval"],
    scheduled: ["working", "◷", "Scheduled"], publishing: ["working", "…", "Publishing"],
    published: ["working", "✓", "Published"], posted_manually: ["working", "✓", "Posted manually"], failed: ["failed", "×", "Failed"],
  };
  const [tone, glyph, label] = states[status] ?? ["idle", "–", status];
  return pill ? <LabelPill tone={tone}>{label}</LabelPill> : <Status tone={tone} glyph={glyph} mono className={s.postStatus}>{label}</Status>;
}

export function PostPreview({ platform, text, imageUrl, title, account, mock, linkUrl, mediaOnly = false }: { platform: SocialPlatform; text: string; imageUrl: string | null; title: string; account?: string | null; mock?: boolean; linkUrl?: string | null; mediaOnly?: boolean }) {
  const p = PLATFORM[platform];
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const image = imageUrl && imageUrl !== failedImage && isPublicHttpsImageUrl(imageUrl) ? imageUrl : null;
  return <div className={s.preview} data-platform={platform}>
    {!mediaOnly && <><div className={s.account}><span className={s.avatar}><Avatar name={account || "Owner"} size={30} /></span><div className={s.accountText}><strong>{account || "Your account"}</strong><span>{p.label} · {title}</span></div><span className={s.platformMark}>{p.mark}</span>{mock && <Tag>MOCK</Tag>}</div>
    <p className={s.caption}>{text || "Your post preview appears here."}</p>
    {linkUrl && <p className={s.meta}>{linkUrl}</p>}</>}
    {image ? <div className={s.media} data-platform={platform}>{/* External media is fetched by the browser, never the private LifeOS server. */}<Image unoptimized width={640} height={640} src={image} alt={`Media for ${title}`} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedImage(image)} /></div> : mediaOnly ? <div className={s.mediaPlaceholder}>{platform === "tiktok" ? "9:16 VIDEO" : platform === "instagram" ? "PHOTO" : platform === "portfolio" ? "HERO IMAGE" : "TEXT POST"} · {imageUrl ? "Media unavailable" : "No media attached"}</div> : ["instagram", "tiktok"].includes(platform) ? <div className={s.missing}><Icon name="image" size={22} />{failedImage === imageUrl ? "Media unavailable" : "No media attached"} · {p.label} needs {platform === "tiktok" ? "a 9:16 video posted in the app" : "a photo"}</div> : null}
  </div>;
}
