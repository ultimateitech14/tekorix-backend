import { randomUUID } from "crypto";

import { getPool } from "../database/pool.js";
import {
  normalizeTimestamp,
  readJsonFile,
  trimToString,
  writeJsonFile,
} from "./shared-admin-files.js";

export type BlogPostSection = {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
};

export type AdminBlogPostRecord = {
  id: string;
  slug: string;
  category: string;
  date: string;
  readTime: string;
  title: string;
  description: string;
  coverImage: string;
  coverAlt: string;
  intro: string;
  sections: BlogPostSection[];
  isPublished: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UpsertBlogPostInput = {
  slug: string;
  category: string;
  date: string;
  readTime: string;
  title: string;
  description: string;
  coverImage: string;
  coverAlt: string;
  intro: string;
  sections: BlogPostSection[];
  isPublished?: boolean;
};

type BlogPostRow = {
  id: string;
  slug: string;
  category: string;
  date_label: string;
  read_time: string;
  title: string;
  description: string;
  cover_image: string;
  cover_alt: string;
  intro: string;
  sections: unknown;
  is_published: boolean;
  published_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

const defaultBlogPosts: Omit<AdminBlogPostRecord, "id" | "isPublished" | "publishedAt" | "createdAt" | "updatedAt">[] = [
  {
    slug: "reduce-hiring-friction",
    category: "Hiring",
    date: "April 2026",
    readTime: "6 min read",
    title: "How high-growth teams reduce hiring friction without slowing delivery.",
    description: "A practical look at role clarity, faster screening, and team-building models that keep projects moving.",
    coverImage: "/images/commitment-professional.jpg",
    coverAlt: "Hiring team discussing candidate pipeline and delivery timelines",
    intro: "Growing teams often lose speed not because demand is low, but because hiring and delivery teams run on different assumptions. Strong teams close that gap early with clear ownership and fewer handoff loops.",
    sections: [
      {
        heading: "Start with role clarity before opening positions",
        paragraphs: [
          "The fastest teams document success criteria before posting jobs. This avoids late-stage confusion between hiring managers, recruiters, and interviewers.",
          "When everyone evaluates candidates against one shared role scorecard, screening quality improves and interview rounds become shorter.",
        ],
      },
      {
        heading: "Reduce interview noise with a calibrated panel",
        paragraphs: [
          "Keep interview panels compact and intentional. Each interviewer should evaluate a specific capability area instead of repeating the same broad discussion.",
          "A predictable interview sequence gives candidates confidence and helps the team compare profiles fairly.",
        ],
        bullets: [
          "Role scorecard shared with all interviewers",
          "Defined interview stage owners",
          "Decision meeting within 24 hours of final round",
        ],
      },
      {
        heading: "Use pod-based hiring for urgent delivery goals",
        paragraphs: [
          "When roadmap pressure is high, single-role hiring can be too slow. Pod-based or team-based staffing lets delivery continue while permanent hiring catches up.",
          "This blended model is useful for product launches, platform migrations, and high-variance sprint cycles.",
        ],
      },
    ],
  },
  {
    slug: "candidate-preparation-patterns",
    category: "Careers",
    date: "April 2026",
    readTime: "5 min read",
    title: "What strong candidates do before applying for modern engineering roles.",
    description: "The preparation patterns that help professionals stand out across product, cloud, data, and AI hiring.",
    coverImage: "/images/commitment-professional.jpg",
    coverAlt: "Candidate preparing portfolio for engineering interview",
    intro: "Good candidates are not only technically ready, they are context ready. Teams now expect professionals to connect their skills with product outcomes, delivery constraints, and collaboration habits.",
    sections: [
      {
        heading: "Translate projects into impact stories",
        paragraphs: [
          "Resumes that list tools without outcomes are harder to evaluate. Hiring teams prefer evidence of impact such as reduced latency, improved release stability, or faster time to market.",
          "A clear project narrative helps recruiters and hiring managers quickly map your profile to role expectations.",
        ],
      },
      {
        heading: "Prepare for practical, scenario-based interviews",
        paragraphs: [
          "Many interviews now include delivery scenarios instead of trivia questions. Candidates should practice discussing tradeoffs, prioritization, and communication under deadlines.",
          "When you can explain why a decision was made, not just what was built, your profile becomes more credible.",
        ],
        bullets: [
          "Keep one page of project metrics ready",
          "Prepare two architecture tradeoff examples",
          "Practice concise problem statements before solutions",
        ],
      },
      {
        heading: "Keep profiles consistent across resume and LinkedIn",
        paragraphs: [
          "Mismatch between resume and online profiles slows down screening. Consistent summaries, timelines, and role scopes create trust faster.",
          "A clear profile also increases your chances of being matched to future roles beyond the one you applied for today.",
        ],
      },
    ],
  },
  {
    slug: "contract-staffing-scope-ownership",
    category: "Delivery",
    date: "April 2026",
    readTime: "7 min read",
    title: "Why contract staffing works best when scope and ownership are defined early.",
    description: "How companies can use flexible hiring support without creating confusion across teams and timelines.",
    coverImage: "/images/commitment-professional.jpg",
    coverAlt: "Delivery planning board with milestones and ownership lanes",
    intro: "Contract staffing creates real value when it is treated as a delivery strategy, not just a headcount patch. Clear scope, explicit interfaces, and operational discipline are the main difference makers.",
    sections: [
      {
        heading: "Define what the external team owns end-to-end",
        paragraphs: [
          "Teams lose momentum when ownership boundaries are fuzzy. Clearly assign deliverables, quality gates, and reporting lines from day one.",
          "Well-defined ownership reduces rework and helps internal teams focus on core strategic priorities.",
        ],
      },
      {
        heading: "Build shared rituals for one operating cadence",
        paragraphs: [
          "Contract teams should join the same planning, review, and release rhythm as internal teams. Separate rituals create blind spots and delays.",
          "Shared cadence improves visibility and helps resolve blockers early.",
        ],
        bullets: [
          "Single sprint board for all contributors",
          "Common definition of done and quality checks",
          "Weekly risk review with client and partner leads",
        ],
      },
      {
        heading: "Treat onboarding as a delivery accelerator",
        paragraphs: [
          "Structured onboarding during the first two weeks can dramatically improve later sprint velocity. Teams need architecture context, domain basics, and communication norms immediately.",
          "A planned onboarding flow makes contract engagements productive faster and reduces stakeholder anxiety.",
        ],
      },
    ],
  },
  {
    slug: "salary-benchmarking-for-product-teams",
    category: "Compensation",
    date: "April 2026",
    readTime: "4 min read",
    title: "How salary benchmarking helps product teams hire with less negotiation churn.",
    description: "Compensation bands backed by market context reduce offer drop-offs and shorten hiring cycles.",
    coverImage: "/images/commitment-professional.jpg",
    coverAlt: "Compensation benchmarking report on a laptop screen",
    intro: "Compensation uncertainty is one of the most common reasons offers stall. Teams that maintain clear benchmarking ranges usually close roles faster and with better candidate experience.",
    sections: [
      {
        heading: "Set transparent bands for each seniority level",
        paragraphs: [
          "Clear pay bands reduce friction between recruiters, hiring managers, and finance approvals.",
          "Candidates also respond better when compensation logic feels consistent and credible.",
        ],
      },
      {
        heading: "Review benchmark data quarterly",
        paragraphs: [
          "Fast-moving skill areas like cloud, data, and AI can shift quickly. Quarterly checks prevent outdated offers.",
          "Regular updates also help workforce planning for upcoming hiring waves.",
        ],
      },
    ],
  },
  {
    slug: "ai-recruiting-playbook",
    category: "AI in Recruiting",
    date: "April 2026",
    readTime: "5 min read",
    title: "A practical AI recruiting playbook for faster shortlisting and better candidate quality.",
    description: "Where automation helps in sourcing and screening, and where human judgment should remain central.",
    coverImage: "/images/commitment-professional.jpg",
    coverAlt: "Recruiter reviewing AI-assisted candidate shortlists",
    intro: "AI can reduce repetitive recruiting work, but it should support decisions instead of replacing decision quality. The right model is human-led hiring with automation at the right touchpoints.",
    sections: [
      {
        heading: "Automate repetitive screening checks",
        paragraphs: [
          "Use AI-assisted parsing for baseline qualification checks, skill clustering, and profile summarization.",
          "This gives recruiters more time for deeper evaluation and candidate engagement.",
        ],
      },
      {
        heading: "Keep final-fit decisions human-led",
        paragraphs: [
          "Culture fit, collaboration style, and growth potential require contextual judgment that automation cannot fully replace.",
          "Strong teams use AI for speed and humans for final quality decisions.",
        ],
      },
    ],
  },
];

let blogSeedAttempted = false;
const storageFileName = "blog-posts.json";

function toIsoString(value: Date | string | null) {
  if (value === null) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  return value.toISOString();
}

function normalizeSections(value: unknown): BlogPostSection[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized: BlogPostSection[] = [];

  for (const item of value) {
    const entry = item && typeof item === "object" ? (item as Partial<BlogPostSection>) : {};
    const heading = typeof entry.heading === "string" ? entry.heading.trim() : "";
    const paragraphs = Array.isArray(entry.paragraphs)
      ? entry.paragraphs.map((paragraph) => String(paragraph).trim()).filter(Boolean)
      : [];
    const bullets = Array.isArray(entry.bullets)
      ? entry.bullets.map((bullet) => String(bullet).trim()).filter(Boolean)
      : undefined;

    if (!heading || !paragraphs.length) {
      continue;
    }

    normalized.push({
      heading,
      paragraphs,
      bullets: bullets?.length ? bullets : undefined,
    });
  }

  return normalized;
}

function buildDefaultFallbackBlogPosts() {
  const timestamp = new Date("2026-04-01T00:00:00.000Z").toISOString();

  return defaultBlogPosts.map((item, index) => ({
    id: `blog-seed-${String(index + 1).padStart(4, "0")}`,
    slug: item.slug,
    category: item.category,
    date: item.date,
    readTime: item.readTime,
    title: item.title,
    description: item.description,
    coverImage: item.coverImage,
    coverAlt: item.coverAlt,
    intro: item.intro,
    sections: item.sections,
    isPublished: true,
    publishedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
}

function normalizeFallbackBlogPost(value: unknown): AdminBlogPostRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as Partial<AdminBlogPostRecord>;
  const id = trimToString(item.id);
  const slug = trimToString(item.slug);
  const category = trimToString(item.category);
  const date = trimToString(item.date);
  const readTime = trimToString(item.readTime);
  const title = trimToString(item.title);
  const description = trimToString(item.description);
  const coverImage = trimToString(item.coverImage);
  const coverAlt = trimToString(item.coverAlt);
  const intro = trimToString(item.intro);
  const sections = normalizeSections(item.sections);

  if (!id || !slug || !category || !date || !readTime || !title || !description || !coverImage || !coverAlt || !intro || !sections.length) {
    return null;
  }

  return {
    id,
    slug,
    category,
    date,
    readTime,
    title,
    description,
    coverImage,
    coverAlt,
    intro,
    sections,
    isPublished: Boolean(item.isPublished),
    publishedAt:
      typeof item.publishedAt === "string" && !Number.isNaN(new Date(item.publishedAt).getTime())
        ? item.publishedAt
        : null,
    createdAt: normalizeTimestamp(item.createdAt),
    updatedAt: normalizeTimestamp(item.updatedAt),
  };
}

function mapBlogPostRow(row: BlogPostRow): AdminBlogPostRecord {
  return {
    id: row.id,
    slug: row.slug,
    category: row.category,
    date: row.date_label,
    readTime: row.read_time,
    title: row.title,
    description: row.description,
    coverImage: row.cover_image,
    coverAlt: row.cover_alt,
    intro: row.intro,
    sections: normalizeSections(row.sections),
    isPublished: row.is_published,
    publishedAt: toIsoString(row.published_at),
    createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
    updatedAt: toIsoString(row.updated_at) ?? new Date().toISOString(),
  };
}

async function ensureBlogPostsSeeded() {
  if (blogSeedAttempted) {
    return;
  }

  const pool = getPool();
  const countResult = await pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM blog_posts");

  if (Number(countResult.rows[0]?.count ?? "0") > 0) {
    blogSeedAttempted = true;
    return;
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const item of defaultBlogPosts) {
      const now = new Date().toISOString();
      await client.query(
        `
          INSERT INTO blog_posts (
            id,
            slug,
            category,
            date_label,
            read_time,
            title,
            description,
            cover_image,
            cover_alt,
            intro,
            sections,
            is_published,
            published_at,
            created_at,
            updated_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, true, $12, $13, $14
          )
          ON CONFLICT (slug) DO NOTHING
        `,
        [
          randomUUID(),
          item.slug,
          item.category,
          item.date,
          item.readTime,
          item.title,
          item.description,
          item.coverImage,
          item.coverAlt,
          item.intro,
          JSON.stringify(item.sections),
          now,
          now,
          now,
        ],
      );
    }

    await client.query("COMMIT");
    blogSeedAttempted = true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function readAllBlogPosts() {
  await ensureBlogPostsSeeded();
  const result = await getPool().query<BlogPostRow>(
    `
      SELECT
        id,
        slug,
        category,
        date_label,
        read_time,
        title,
        description,
        cover_image,
        cover_alt,
        intro,
        sections,
        is_published,
        published_at,
        created_at,
        updated_at
      FROM blog_posts
      ORDER BY COALESCE(published_at, updated_at) DESC, updated_at DESC
    `,
  );

  return result.rows.map((row) => mapBlogPostRow(row));
}

async function readBlogPostsFileFallback() {
  const parsed = await readJsonFile<unknown[]>(storageFileName, buildDefaultFallbackBlogPosts());

  return parsed
    .map((item) => normalizeFallbackBlogPost(item))
    .filter((item): item is AdminBlogPostRecord => Boolean(item))
    .sort((left, right) => {
      const leftDate = left.publishedAt ?? left.updatedAt;
      const rightDate = right.publishedAt ?? right.updatedAt;
      return leftDate < rightDate ? 1 : -1;
    });
}

async function writeBlogPostsFileFallback(items: AdminBlogPostRecord[]) {
  await writeJsonFile(storageFileName, items);
}

export async function listAdminBlogPosts() {
  try {
    return await readAllBlogPosts();
  } catch {
    return readBlogPostsFileFallback();
  }
}

export async function listPublicBlogPosts() {
  try {
    const items = await readAllBlogPosts();
    return items.filter((item) => item.isPublished);
  } catch {
    const items = await readBlogPostsFileFallback();
    return items.filter((item) => item.isPublished);
  }
}

export async function getAdminBlogPostById(id: string) {
  try {
    await ensureBlogPostsSeeded();
    const result = await getPool().query<BlogPostRow>(
      `
        SELECT
          id,
          slug,
          category,
          date_label,
          read_time,
          title,
          description,
          cover_image,
          cover_alt,
          intro,
          sections,
          is_published,
          published_at,
          created_at,
          updated_at
        FROM blog_posts
        WHERE id = $1
        LIMIT 1
      `,
      [id],
    );

    return result.rows[0] ? mapBlogPostRow(result.rows[0]) : null;
  } catch {
    const items = await readBlogPostsFileFallback();
    return items.find((item) => item.id === id) ?? null;
  }
}

export async function getPublicBlogPostBySlug(slug: string) {
  try {
    await ensureBlogPostsSeeded();
    const result = await getPool().query<BlogPostRow>(
      `
        SELECT
          id,
          slug,
          category,
          date_label,
          read_time,
          title,
          description,
          cover_image,
          cover_alt,
          intro,
          sections,
          is_published,
          published_at,
          created_at,
          updated_at
        FROM blog_posts
        WHERE slug = $1 AND is_published = true
        LIMIT 1
      `,
      [slug],
    );

    return result.rows[0] ? mapBlogPostRow(result.rows[0]) : null;
  } catch {
    const items = await readBlogPostsFileFallback();
    return items.find((item) => item.slug === slug && item.isPublished) ?? null;
  }
}

export async function createAdminBlogPost(input: UpsertBlogPostInput) {
  const now = new Date().toISOString();
  const id = randomUUID();

  try {
    await ensureBlogPostsSeeded();
    const result = await getPool().query<BlogPostRow>(
      `
        INSERT INTO blog_posts (
          id,
          slug,
          category,
          date_label,
          read_time,
          title,
          description,
          cover_image,
          cover_alt,
          intro,
          sections,
          is_published,
          published_at,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14, $15
        )
        RETURNING
          id,
          slug,
          category,
          date_label,
          read_time,
          title,
          description,
          cover_image,
          cover_alt,
          intro,
          sections,
          is_published,
          published_at,
          created_at,
          updated_at
      `,
      [
        id,
        input.slug.trim(),
        input.category.trim(),
        input.date.trim(),
        input.readTime.trim(),
        input.title.trim(),
        input.description.trim(),
        input.coverImage.trim(),
        input.coverAlt.trim(),
        input.intro.trim(),
        JSON.stringify(input.sections),
        Boolean(input.isPublished),
        input.isPublished ? now : null,
        now,
        now,
      ],
    );

    return mapBlogPostRow(result.rows[0]);
  } catch {
    const items = await readBlogPostsFileFallback();
    const next: AdminBlogPostRecord = {
      id,
      slug: input.slug.trim(),
      category: input.category.trim(),
      date: input.date.trim(),
      readTime: input.readTime.trim(),
      title: input.title.trim(),
      description: input.description.trim(),
      coverImage: input.coverImage.trim(),
      coverAlt: input.coverAlt.trim(),
      intro: input.intro.trim(),
      sections: input.sections,
      isPublished: Boolean(input.isPublished),
      publishedAt: input.isPublished ? now : null,
      createdAt: now,
      updatedAt: now,
    };

    items.unshift(next);
    await writeBlogPostsFileFallback(items);
    return next;
  }
}

export async function updateAdminBlogPost(id: string, input: UpsertBlogPostInput) {
  const current = await getAdminBlogPostById(id);

  if (!current) {
    return null;
  }

  const now = new Date().toISOString();
  const isPublished = Boolean(input.isPublished);
  const publishedAt = isPublished ? current.publishedAt ?? now : null;
  try {
    const result = await getPool().query<BlogPostRow>(
      `
        UPDATE blog_posts
        SET
          slug = $2,
          category = $3,
          date_label = $4,
          read_time = $5,
          title = $6,
          description = $7,
          cover_image = $8,
          cover_alt = $9,
          intro = $10,
          sections = $11::jsonb,
          is_published = $12,
          published_at = $13,
          updated_at = $14
        WHERE id = $1
        RETURNING
          id,
          slug,
          category,
          date_label,
          read_time,
          title,
          description,
          cover_image,
          cover_alt,
          intro,
          sections,
          is_published,
          published_at,
          created_at,
          updated_at
      `,
      [
        id,
        input.slug.trim(),
        input.category.trim(),
        input.date.trim(),
        input.readTime.trim(),
        input.title.trim(),
        input.description.trim(),
        input.coverImage.trim(),
        input.coverAlt.trim(),
        input.intro.trim(),
        JSON.stringify(input.sections),
        isPublished,
        publishedAt,
        now,
      ],
    );

    return result.rows[0] ? mapBlogPostRow(result.rows[0]) : null;
  } catch {
    const items = await readBlogPostsFileFallback();
    const index = items.findIndex((item) => item.id === id);

    if (index < 0) {
      return null;
    }

    const updated: AdminBlogPostRecord = {
      ...current,
      slug: input.slug.trim(),
      category: input.category.trim(),
      date: input.date.trim(),
      readTime: input.readTime.trim(),
      title: input.title.trim(),
      description: input.description.trim(),
      coverImage: input.coverImage.trim(),
      coverAlt: input.coverAlt.trim(),
      intro: input.intro.trim(),
      sections: input.sections,
      isPublished,
      publishedAt,
      updatedAt: now,
    };

    const next = [...items];
    next[index] = updated;
    await writeBlogPostsFileFallback(next);
    return updated;
  }
}

export async function deleteAdminBlogPost(id: string) {
  try {
    const result = await getPool().query("DELETE FROM blog_posts WHERE id = $1", [id]);
    return (result.rowCount ?? 0) > 0;
  } catch {
    const items = await readBlogPostsFileFallback();
    const next = items.filter((item) => item.id !== id);
    const deleted = next.length !== items.length;

    if (deleted) {
      await writeBlogPostsFileFallback(next);
    }

    return deleted;
  }
}

export async function publishAdminBlogPost(id: string, isPublished: boolean) {
  const current = await getAdminBlogPostById(id);

  if (!current) {
    return null;
  }

  const now = new Date().toISOString();
  try {
    const result = await getPool().query<BlogPostRow>(
      `
        UPDATE blog_posts
        SET
          is_published = $2,
          published_at = $3,
          updated_at = $4
        WHERE id = $1
        RETURNING
          id,
          slug,
          category,
          date_label,
          read_time,
          title,
          description,
          cover_image,
          cover_alt,
          intro,
          sections,
          is_published,
          published_at,
          created_at,
          updated_at
      `,
      [id, isPublished, isPublished ? current.publishedAt ?? now : null, now],
    );

    return result.rows[0] ? mapBlogPostRow(result.rows[0]) : null;
  } catch {
    const items = await readBlogPostsFileFallback();
    const index = items.findIndex((item) => item.id === id);

    if (index < 0) {
      return null;
    }

    const updated: AdminBlogPostRecord = {
      ...current,
      isPublished,
      publishedAt: isPublished ? current.publishedAt ?? now : null,
      updatedAt: now,
    };

    const next = [...items];
    next[index] = updated;
    await writeBlogPostsFileFallback(next);
    return updated;
  }
}
