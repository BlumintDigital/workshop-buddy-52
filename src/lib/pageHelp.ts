import { matchPath } from "react-router-dom";
import type { AppRole } from "@/hooks/useAuth";

/**
 * In-page help: what each page is for, where it sits in a project's life and what each role can do
 * there. Each entry links to its section of docs/user-guide.md, which stays the full reference;
 * src/test/pageHelp.test.ts checks every route and guide link here is real.
 */

/** A project's stages, as in the user guide's project lifecycle (section 8.1). */
export const WORKFLOW_STAGES = [
  "Received",
  "Evaluation",
  "Quote",
  "Approved",
  "In progress",
  "Quality check",
  "Ready to ship",
  "Shipped",
] as const;
export type WorkflowStage = (typeof WORKFLOW_STAGES)[number];

export type RoleHelp = {
  /** One or two sentences: what this page is for, for this role. */
  purpose: string;
  /** What you can do here, as short task-shaped lines. */
  actions: string[];
  /** Stages this page works on. Empty means the page looks across every stage. */
  stages: WorkflowStage[];
  /** A line under the workflow strip, for anything the stages alone don't say. */
  workflowNote?: string;
  /** Heading of this role's section in docs/user-guide.md, e.g. "5.9 Reception". */
  guideHeading: string;
};

export type PageHelpEntry = {
  /** Stable id, recorded when someone opens the help. Lowercase letters, digits and dashes. */
  key: string;
  title: string;
  /** Route patterns (react-router syntax) this help covers. */
  routes: string[];
  /** Help per role; roles left out don't get a help button on this page. */
  roles: Partial<Record<AppRole, RoleHelp>>;
};

const todayForManagers: Omit<RoleHelp, "guideHeading"> = {
  purpose: "Start the day here. It lists what needs someone's action now and shows how the workshop is doing.",
  actions: [
    "Work down Needs attention: overdue invoices, finished projects with no invoice, projects waiting for quality check, low stock and quotes waiting on the client. Each line has the button that fixes it.",
    "Check the figures: revenue this month, open projects, money awaiting payment and today's appointments.",
    "See projects in progress and who is carrying the most work.",
    "Use New → Project to log a machine at Reception.",
    "Use Customise to choose and order the cards, and Refresh to reload the figures.",
  ],
  stages: [],
  workflowNote: "Today looks across every stage, so you can spot work that's stuck.",
};

const projectsForManagers: RoleHelp = {
    purpose: "Every project, each with its permanent ID, from the moment it's logged to the moment it's shipped.",
    actions: [
      "Filter by stage with the chips, or search by project ID or title.",
      "Open a row to see everything about that project on one page.",
      "Use Log a machine to start a new project at Reception.",
    ],
    stages: [],
    workflowNote: "Every project starts at Reception and moves forward from its own page.",
    guideHeading: "5.2 Projects",
  };

const projectForManagers: RoleHelp = {
    purpose: "Everything about one project: its stage, intake details and photos, quotes, tasks, parts, time, files, the client conversation and team notes.",
    actions: [
      "Move the project forward with the buttons in the stage panel, so nothing skips its quote, quality check or handover.",
      "Use the Status menu only to go back a stage or cancel; it asks for a reason and saves it as a team note.",
      "Build and send the quote, or add a change request if the work changes after it started.",
      "Add tasks for each team, with estimated hours where you can.",
      "Keep internal notes in Team notes; the client only sees Client messages.",
      "Download the project report, or create the invoice once the work is done.",
    ],
    stages: [],
    workflowNote: "The stage panel shows where this project is and what has to happen next.",
    guideHeading: "5.2 Projects",
  };

const receptionForManagers: RoleHelp = {
    purpose: "Where every project starts: log a machine as it arrives, or receive a request a client sent from their portal.",
    actions: [
      "In Log a machine, pick a portal client or enter a walk-in customer, then describe the machine, the reported problem and its condition on arrival.",
      "Add arrival photos; the client can see them.",
      "Choose how it came in: Evaluation (assess it first), Quote (price it before work) or Approved job (start work).",
      "In Client requests, receive a request when the machine arrives, or decline it with a reason.",
      "Check Received this week to answer \"where's my machine?\" without leaving the page.",
    ],
    stages: ["Received"],
    workflowNote: "Logging the machine creates the project with its permanent ID and opens its page.",
    guideHeading: "5.9 Reception",
  };

const invoicesForManagers: RoleHelp = {
    purpose: "Every invoice: drafts to check, invoices sent and waiting, overdue ones to chase and paid ones.",
    actions: [
      "Check the drafts. One is made automatically when a project passes quality check, from the accepted quote and approved changes.",
      "Send it to the client, with a payment link or payment instructions.",
      "Filter by Drafts, Sent, Overdue or Paid, and remind clients about overdue invoices.",
      "Record a payment when it arrives. With an accounting system connected, invoices and payments sync to it.",
    ],
    stages: ["Quality check", "Ready to ship", "Shipped"],
    workflowNote: "Billing runs alongside shipping: the draft invoice appears when a project passes quality check.",
    guideHeading: "5.7 Invoices",
  };

export const PAGE_HELP: PageHelpEntry[] = [
  {
    key: "today",
    title: "Today",
    routes: ["/admin/dashboard", "/manager/dashboard"],
    roles: {
      admin: { ...todayForManagers, guideHeading: "4.1 Today" },
      manager: { ...todayForManagers, guideHeading: "5.1 Today" },
    },
  },
  {
    key: "projects",
    title: "Projects",
    routes: ["/admin/projects", "/manager/projects", "/staff/projects", "/client/projects"],
    roles: {
      admin: projectsForManagers,
      manager: projectsForManagers,
      staff: {
        purpose: "Projects where you or one of your teams has tasks.",
        actions: [
          "Open a project to start or finish your task.",
          "Hand your task off to the next team with a note when you're done.",
          "Request parts, log your time and add photos from the project page.",
        ],
        stages: ["Approved", "In progress"],
        guideHeading: "6.2 My projects",
      },
      client: {
        purpose: "Everything you have with the workshop: quotes waiting for your decision, requests not received yet, then your projects.",
        actions: [
          "Accept or decline quotes at the top of the list.",
          "Press New request to ask for a repair, an evaluation or a quote.",
          "Open a project to follow its progress, message the workshop and choose collection or delivery.",
        ],
        stages: [],
        workflowNote: "Each project shows which of these stages it has reached.",
        guideHeading: "7.2 My projects",
      },
    },
  },
  {
    key: "project",
    title: "Project page",
    routes: ["/projects/:id"],
    roles: {
      admin: projectForManagers,
      manager: projectForManagers,
      staff: {
        purpose: "The project you're working on, with your tasks, parts, time, files and notes.",
        actions: [
          "Start your task, then hand it off to the next team with a note when it's done.",
          "Request parts from inventory for this project.",
          "Log the time you worked.",
          "Add photos and files, and keep internal notes in Team notes.",
          "Reply to the client in Client messages; they never see Team notes.",
        ],
        stages: ["In progress"],
        workflowNote: "When every task is done, the project goes to quality check.",
        guideHeading: "6.2 My projects",
      },
      client: {
        purpose: "Where your project is, and everything the workshop needs from you.",
        actions: [
          "See which stage it has reached and the photos taken when it arrived.",
          "Accept or decline quotes and change requests.",
          "Message the workshop and send files.",
          "When it's ready, choose collection or delivery.",
        ],
        stages: [],
        guideHeading: "7.2 My projects",
      },
    },
  },
  {
    key: "reception",
    title: "Reception",
    routes: ["/reception"],
    roles: {
      admin: receptionForManagers,
      manager: receptionForManagers,
      staff: {
        purpose: "Where every project starts: log a machine as it arrives, or receive a request a client sent from their portal.",
        actions: [
          "In Log a machine, pick a portal client or enter a walk-in customer, then describe the machine, the reported problem and its condition on arrival.",
          "Add arrival photos; the client can see them.",
          "Choose how it came in: Evaluation (assess it first), Quote (price it before work) or Approved job (start work).",
          "In Client requests, receive a request when the machine arrives, or decline it with a reason.",
        ],
        stages: ["Received"],
        workflowNote: "Logging the machine creates the project with its permanent ID and opens its page.",
        guideHeading: "5.9 Reception",
      },
    },
  },
  {
    key: "invoices",
    title: "Invoices",
    routes: ["/invoices", "/admin/invoices", "/manager/invoices", "/client/invoices"],
    roles: {
      admin: invoicesForManagers,
      manager: invoicesForManagers,
      staff: {
        purpose: "Invoices you handle with the Billing permission: drafts to check, sent, overdue and paid.",
        actions: [
          "Check the drafts made when projects pass quality check, then send them.",
          "Remind clients about overdue invoices and record payments when they arrive.",
        ],
        stages: ["Quality check", "Ready to ship", "Shipped"],
        workflowNote: "The draft invoice appears when a project passes quality check.",
        guideHeading: "5.7 Invoices",
      },
      client: {
        purpose: "Your invoices from the workshop.",
        actions: ["Open an invoice to view it, pay online or download it as a PDF."],
        stages: ["Shipped"],
        guideHeading: "7.4 Appointments and invoices",
      },
    },
  },
];

/** The help entry and role-specific content for a path, or null when this page has none for the role. */
export function findPageHelp(pathname: string, role: AppRole | null): { entry: PageHelpEntry; help: RoleHelp } | null {
  if (!role) return null;
  for (const entry of PAGE_HELP) {
    if (entry.routes.some((pattern) => matchPath({ path: pattern, end: true }, pathname))) {
      const help = entry.roles[role];
      return help ? { entry, help } : null;
    }
  }
  return null;
}
