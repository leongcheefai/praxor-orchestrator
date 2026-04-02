import type { OrchestratorConfig } from "./src/types";

const config: OrchestratorConfig = {
  outputDir: "~/orchestrator/output",
  stalenessThresholdDays: 7,
  telegram: {
    enabled: true,
  },
  projects: [
    {
      name: "offero",
      path: "/Users/leongcheefai/Documents/private/projects/offero",
      type: "saas",
      platform: "web",
      status: "active",
      description: "Offero is a platform for creating and managing offers for your products and services.",
    },
    {
      name: "viaticus",
      path: "/Users/leongcheefai/Documents/private/projects/firsttofly/firsttofly-garage-viaticus",
      type: "client",
      platform: "both",
      status: "active",
      description: "Client mobile + web app",
      clientName: "Acme Corp",
      budget: { total: 50000, invoiced: 25000, currency: "USD" },
    },
    {
      name: "praxor",
      path: "/Users/leongcheefai/Documents/private/projects/praxor",
      type: "saas",
      platform: "web",
      status: "active",
      description: "Offero is a platform for creating and managing offers for your products and services.",
    },
    {
      name: "onz-webapp",
      path: "/Users/leongcheefai/Documents/private/projects/onz-webapp",
      type: "saas",
      platform: "web",
      status: "active",
      description: "Offero is a platform for creating and managing offers for your products and services.",
    },
    {
      name: "vanta - team hub",
      path: "/Users/leongcheefai/Documents/private/projects/vanta/team-hub-",
      type: "saas",
      platform: "web",
      status: "active",
      description: "Offero is a platform for creating and managing offers for your products and services.",
    },
    {
      name: "vanta - workshop management",
      path: "/Users/leongcheefai/Documents/private/projects/vanta/workshop-management-system",
      type: "saas",
      platform: "web",
      status: "active",
      description: "Offero is a platform for creating and managing offers for your products and services.",
    },
    // {
    //   name: "old-tool",
    //   path: "~/projects/old-tool",
    //   type: "micro-tool",
    //   platform: "web",
    //   status: "parked",
    //   description: "Utility tool (paused)",
    //   parkedReason: "Waiting for upstream API v2",
    //   reactivateWhen: "API v2 launches",
    // },
  ],
};

export default config;
