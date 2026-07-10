import type { GameSlug, ServiceType } from "@/lib/catalog/types";
import { getGame } from "@/lib/catalog/source";

/**
 * Marketing content + SEO metadata for the public money pages. Templated from
 * game + service specifics so every page has substantive, unique copy (spec §16)
 * without hand-writing 12 pages.
 */

export interface ServiceMeta {
  type: ServiceType;
  slug: string;
  name: string;
  short: string;
  blurb: string;
}

export const SERVICES: ServiceMeta[] = [
  {
    type: "rank_boost",
    slug: "rank-boost",
    name: "Rank / Division Boost",
    short: "Rank Boost",
    blurb: "Climb from your current rank to your goal — a pro plays until you're there.",
  },
  {
    type: "placements",
    slug: "placements",
    name: "Placement Matches",
    short: "Placements",
    blurb: "Start your season strong with a high-win-rate placement run.",
  },
  {
    type: "net_wins",
    slug: "net-wins",
    name: "Ranked Net Wins",
    short: "Net Wins",
    blurb: "Buy a set number of guaranteed net wins at your current rank.",
  },
];

export function getServiceBySlug(slug: string): ServiceMeta | undefined {
  return SERVICES.find((s) => s.slug === slug);
}

export function getServiceByType(type: ServiceType): ServiceMeta {
  const s = SERVICES.find((x) => x.type === type);
  if (!s) throw new Error(`Unknown service type ${type}`);
  return s;
}

interface GameContent {
  /** How the ranked ladder works, in one sentence. */
  ladderNote: string;
  /** Name of the per-win currency for flavor (LP, RR, SR-ish). */
  pointsNote: string;
}

const GAME_CONTENT: Record<GameSlug, GameContent> = {
  "league-of-legends": {
    ladderNote:
      "League of Legends ranks run Iron through Challenger, each tier split into four divisions (IV to I). You climb by winning games and gaining LP.",
    pointsNote: "LP (League Points)",
  },
  valorant: {
    ladderNote:
      "Valorant ranks run Iron through Radiant, each tier split into three divisions. You climb by winning games and gaining Rank Rating (RR).",
    pointsNote: "RR (Rank Rating)",
  },
  "overwatch-2": {
    ladderNote:
      "Overwatch 2 ranks run Bronze through Champion, each tier split into five divisions. Your rank updates as your win/loss record improves.",
    pointsNote: "SR / rank progress",
  },
  "marvel-rivals": {
    ladderNote:
      "Marvel Rivals ranks run Bronze through One Above All, each tier split into three divisions. You climb by winning games and gaining points.",
    pointsNote: "ranked points",
  },
};

export interface ContentSection {
  title: string;
  body: string;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface MoneyPageContent {
  title: string;
  metaTitle: string;
  metaDescription: string;
  intro: string;
  sections: ContentSection[];
  faqs: FaqItem[];
}

export async function getMoneyPageContent(
  gameSlug: GameSlug,
  serviceType: ServiceType,
): Promise<MoneyPageContent> {
  const game = await getGame(gameSlug);
  const service = getServiceByType(serviceType);
  const gc = GAME_CONTENT[gameSlug];

  const serviceIntro: Record<ServiceType, string> = {
    rank_boost: `Our ${game.name} rank boost takes your account from where you are now to the rank you want. Pick your current and desired rank and see a live, itemized price — no hidden fees.`,
    placements: `Placement matches set your rank for the season. Our ${game.name} boosters play your placements with a high win rate so you start the season as high as possible.`,
    net_wins: `Prefer to pay per result? Buy a set number of net wins at your current ${game.name} rank. You only pay for wins that move you forward.`,
  };

  const howBody: Record<ServiceType, string> = {
    rank_boost: `${gc.ladderNote} Choose piloted (a booster plays for you) or duo (you queue together). Your price is the sum of each division you're climbing, adjusted for your region and any options you add.`,
    placements: `${gc.ladderNote} Placement pricing is per game, based on the rank band you finished last season. More games generally means a higher final placement.`,
    net_wins: `${gc.ladderNote} Net-win pricing is per win and scales with your current tier — higher ranks are harder, so each win costs more.`,
  };

  return {
    title: `${game.name} ${service.name}`,
    metaTitle: `${game.name} ${service.name} — Fast, Safe Boosting`,
    metaDescription: `${service.blurb} ${game.name} ${service.name.toLowerCase()} by vetted pros, piloted or duo, priced live. Encrypted account handling and cashback on every order.`,
    intro: serviceIntro[serviceType],
    sections: [
      {
        title: `How ${game.name} ${service.short.toLowerCase()} works`,
        body: howBody[serviceType],
      },
      {
        title: "Your options, explained",
        body: "Every order lets you tune speed and privacy: Express prioritizes your order, Appear offline keeps the booster invisible, Solo queue only avoids duo lobbies, Choose characters lets you specify champions/agents/heroes, and Top-rated booster hands your order to one of our best. Each option shows its exact price and time impact before you buy.",
      },
      {
        title: "Account safety",
        body: `We treat your account like it's our own. Boosters play manually (no scripts or third-party tools), connect from a region matched to yours, and can appear offline. For piloted orders your login is encrypted before it ever touches our database, is visible only to your assigned booster, and is deleted automatically after completion. You relay 2FA codes only through your private order chat.`,
      },
    ],
    faqs: [
      {
        question: `Is ${game.name} boosting safe for my account?`,
        answer:
          "We minimize risk with manual play, region-matched connections, appear-offline, and no third-party tools. Boosting can still violate a game's terms of service, so we handle every order privately and encrypt credentials. See our Terms for the full risk disclosure.",
      },
      {
        question: "Piloted or duo — what's the difference?",
        answer:
          "Piloted means a booster logs in and plays for you (fastest). Duo means you play in the same games as the booster (you stay in control, but it takes a bit longer and costs more).",
      },
      {
        question: "How fast will it be done?",
        answer:
          "Every configuration shows an estimated time range before you buy. Express speeds it up; duo and some privacy options slow it down slightly. Your booster posts live progress in your order chat.",
      },
      {
        question: "Can I get a refund?",
        answer:
          "Yes — a full refund before work begins, and a pro-rated refund for partial progress if you cancel mid-order. See our Refund Policy.",
      },
    ],
  };
}

/** All game×service slug pairs, for static params and the sitemap. */
export function allMoneyPagePaths(): Array<{ game: GameSlug; service: string }> {
  const games: GameSlug[] = ["league-of-legends", "valorant", "overwatch-2", "marvel-rivals"];
  return games.flatMap((game) => SERVICES.map((s) => ({ game, service: s.slug })));
}
