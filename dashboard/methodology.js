const DATA_PATH = "/api/dashboard-data";

function renderCards(targetId, items) {
  const container = document.getElementById(targetId);
  container.innerHTML = "";

  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "check-card";
    card.innerHTML = `
      <span class="check-status">${item.status}</span>
      <strong>${item.title}</strong>
      <p class="detail-copy">${item.copy}</p>
    `;
    container.appendChild(card);
  });
}

async function init() {
  try {
    const response = await fetch(DATA_PATH);
    if (!response.ok) {
      throw new Error("Unable to load methodology data.");
    }

    const data = await response.json();

    renderCards("diagnosticGrid", [
      {
        status: "Universe",
        title: `${data.creators.length} creators analyzed`,
        copy: "The dashboard evaluates the full dataset, not just the challenge shortlist, so profile switching and filtering operate on the entire market universe.",
      },
      {
        status: "Benchmark",
        title: "Commercial normalization",
        copy: "GMV, views, engagement, and projected score are normalized before use so large raw values do not dominate the ranking unfairly.",
      },
      {
        status: "Screening",
        title: "Profile-aware scoring",
        copy: "Industry fit, keyword overlap, audience alignment, and commercial quality are blended into one screening score for exploration mode.",
      },
      {
        status: "Advisor",
        title: "Decision overlay",
        copy: "The three-question advisor shifts the recommendation emphasis toward sales, loyalty, or reach depending on the campaign goal.",
      },
    ]);

    renderCards("requirementGrid", [
      {
        status: "Complete",
        title: "Vector DB setup",
        copy: "Postgres + pgvector schema and retrieval support are implemented in the repo.",
      },
      {
        status: "Complete",
        title: "Ingestion script",
        copy: "The ingestion path embeds and stores creators for the production-grade workflow.",
      },
      {
        status: "Complete",
        title: "searchCreators",
        copy: "The challenge search function is implemented with a hybrid scoring formula.",
      },
      {
        status: "Complete",
        title: "Hybrid scoring formula",
        copy: "The official challenge formula is documented and preserved alongside the dashboard exploration model.",
      },
      {
        status: "Complete",
        title: "Output JSON",
        copy: "The required top-10 output file is generated for the brand_smart_home scenario.",
      },
      {
        status: "Pending",
        title: "2-minute Loom walkthrough",
        copy: "The repository cannot generate the Loom deliverable automatically.",
      },
    ]);
  } catch (error) {
    document.body.innerHTML = `
      <main class="app-shell">
        <section class="panel section">
          <h1>Methodology unavailable</h1>
          <p class="hero-text">${error instanceof Error ? error.message : "Unknown loading error"}</p>
        </section>
      </main>
    `;
  }
}

init();
