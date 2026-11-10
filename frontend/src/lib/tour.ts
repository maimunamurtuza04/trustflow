import type { Role } from "./types";

export interface TourStep {
  selector: string;
  title: string;
  body: string;
}

export const TOURS: Record<Role, TourStep[]> = {
  donor: [
    {
      selector: '[data-tour="page-overview"]',
      title: "This page explains itself",
      body: "Every page opens with an overview: what it covers, what to do next, and a list of its sections. You never have to guess where something lives.",
    },
    {
      selector: '[data-tour="section-nav"]',
      title: "Jump straight to a section",
      body: "These chips stay pinned as you scroll. Use them to move between your summary, allocation, donations and spending.",
    },
    {
      selector: '[data-tour="kpis"]',
      title: "These are your real balances",
      body: "Confirmed donations, projects funded, money paid to suppliers, and restricted money still unspent. They are derived from ledger events, not typed in.",
    },
    {
      selector: '[data-tour="primary-action"]',
      title: "Fund a project",
      body: "Pick a cause and donate. Your money is locked to that project's purpose — the organisation can never withdraw it as cash.",
    },
    {
      selector: "#donations",
      title: "Confirming a pledge",
      body: "A donation starts as a pledge. Press Confirm to run the simulated payment; only then does it become part of the restricted balance.",
    },
    {
      selector: "#purchases",
      title: "Follow the spending",
      body: "Only purchases that passed the deterministic engine appear here. Open one to see the decision, the vendor and the delivery evidence.",
    },
  ],
  organisation: [
    {
      selector: '[data-tour="page-overview"]',
      title: "Your console, explained",
      body: "The overview tells you what this page contains and what needs attention. The next-action card always points at the most useful step.",
    },
    {
      selector: '[data-tour="section-nav"]',
      title: "Grouped sections",
      body: "Funds, approvals, projects and purchase requests each have a section. The nav follows you as you scroll.",
    },
    {
      selector: '[data-tour="kpis"]',
      title: "Restricted funds",
      body: "Received, available, reserved and paid. Reserved money is authorised but not yet settled, so it is not available to spend again.",
    },
    {
      selector: '[data-tour="primary-action"]',
      title: "Request a purchase",
      body: "Submit the vendor, category, amount and quotation reference. Eleven deterministic checks run before any money is reserved.",
    },
    {
      selector: '[data-tour="procurement"]',
      title: "Every decision is on the record",
      body: "Blocked requests show which check failed. Escalated requests wait for an administrator. Authorised requests can be settled to the vendor.",
    },
  ],
  vendor: [
    {
      selector: '[data-tour="page-overview"]',
      title: "Your supplier console",
      body: "The overview explains what you can see here: only the purchase requests that name your business, never project balances.",
    },
    {
      selector: '[data-tour="section-nav"]',
      title: "Move between sections",
      body: "Jump to requests, your business profile or your listings without scrolling through the page.",
    },
    {
      selector: '[data-tour="kpis"]',
      title: "Your order position",
      body: "Requests received, open requests, paid orders and settled value. A blocked request is not an order and never becomes a payout.",
    },
    {
      selector: '[data-tour="purchase-requests"]',
      title: "Open a paid request",
      body: "Once a request is paid, open it to report dispatch and delivery. The organisation then confirms receipt — that receipt is stored as evidence.",
    },
    {
      selector: "#profile",
      title: "Where you get paid",
      body: "Settlement goes to this verified payout reference. An administrator verifies it, and it is re-checked at the moment of payment.",
    },
  ],
  admin: [
    {
      selector: '[data-tour="page-overview"]',
      title: "Control room overview",
      body: "This band explains the page and points at the most urgent item: reviews, policy approvals or verification backlog.",
    },
    {
      selector: '[data-tour="section-nav"]',
      title: "Grouped oversight",
      body: "Jump between the review queue, policy approvals, the verification registry and the audit trail.",
    },
    {
      selector: '[data-tour="kpis"]',
      title: "What needs you",
      body: "The review queue counts purchases the engine refused to decide. Only an administrator can resolve them, and only with recorded notes.",
    },
    {
      selector: '[data-tour="review-queue"]',
      title: "Resolve escalations",
      body: "Open a request to see which checks were inconclusive. Approval is a logged exception — hard checks such as funding and verified payout are re-run.",
    },
    {
      selector: "#policies",
      title: "Approve policy versions",
      body: "A policy only takes effect when you approve it. The previous approved version is superseded, never edited.",
    },
    {
      selector: "#registries",
      title: "Verify who can transact",
      body: "Verify, suspend or reject organisations and suppliers, and confirm vendor payout references before money can move.",
    },
  ],
};
