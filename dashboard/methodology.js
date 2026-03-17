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
      ${
        item.details
          ? `<details class="expand-detail">
              <summary>Longer explanation</summary>
              <p class="detail-copy">${item.details}</p>
            </details>`
          : ""
      }
    `;
    container.appendChild(card);
  });
}

function renderHeroMetrics(data) {
  const container = document.getElementById("heroMetrics");
  container.innerHTML = `
    <span class="panel-label">At a glance</span>
    <div class="hero-metric-list">
      <div class="hero-metric">
        <strong>${data.creators.length}</strong>
        <span class="detail-copy">Creators screened across the full market universe.</span>
      </div>
      <div class="hero-metric">
        <strong>4</strong>
        <span class="detail-copy">Primary Atlas components: fit, query, audience, and commercial quality.</span>
      </div>
      <div class="hero-metric">
        <strong>2</strong>
        <span class="detail-copy">Referenced retrieval papers supporting the fusion approach.</span>
      </div>
      <div class="hero-metric">
        <strong>1</strong>
        <span class="detail-copy">Official challenge ranker preserved separately from the dashboard screen.</span>
      </div>
    </div>
  `;
}

async function init() {
  try {
    const response = await fetch(DATA_PATH);
    if (!response.ok) {
      throw new Error("Unable to load methodology data.");
    }

    const data = await response.json();
    renderHeroMetrics(data);

    renderCards("rationaleGrid", [
      {
        status: "Official",
        title: "Convex fusion",
        copy: "The official ranker blends normalized semantic fit with normalized projected value.",
        details:
          "This keeps both components on the same scale while preserving score magnitude. Because projected_score already contains business signal, a linear blend is more useful here than a rank-only fusion rule.",
      },
      {
        status: "Objective",
        title: "Equal relevance treatment",
        copy: "Industry fit, query overlap, and audience fit are averaged equally.",
        details:
          "This removes the need to justify separate hand-picked coefficients for each relevance feature. The dashboard can describe the model as a neutral average across three fit signals instead of a bespoke percentage split.",
      },
      {
        status: "Balance",
        title: "Two-stage blend",
        copy: "Atlas blends 60% relevance with 40% commercial quality.",
        details:
          "The top-level choice is now explicit and easy to defend: relevance should lead the screen, but commerce still matters materially. That creates one interpretable business decision instead of four smaller subjective ones.",
      },
      {
        status: "Commercial",
        title: "Nested commercial block",
        copy: "Commercial quality is capped, then divided across projected score, engagement, and GMV.",
        details:
          "Projected score leads the block because it is already a forward-looking business indicator from RoC. Engagement adds creator quality and GMV adds evidence of conversion, but neither is allowed to dominate the screen.",
      },
    ]);

    renderCards("referenceGrid", [
      {
        status: "Paper",
        title: "Bruch et al. (2022)",
        copy: "Supports convex combination for hybrid retrieval when scores are normalized.",
        details:
          "The paper 'An Analysis of Fusion Functions for Hybrid Retrieval' motivates the family of score fusion methods used by the official challenge ranker.",
      },
      {
        status: "Paper",
        title: "Cormack et al. (2009)",
        copy: "Defines Reciprocal Rank Fusion, the classic rank-only baseline.",
        details:
          "Atlas references RRF as the comparison point, but does not use it in the final challenge ranker because rank-only fusion would throw away the magnitude of projected_score.",
      },
      {
        status: "Design",
        title: "Scaled heavy-tail metrics",
        copy: "Large creator metrics are normalized before entering the score.",
        details:
          "Follower count, GMV, and views are all heavy-tailed. Log scaling stops a few very large creators from flattening the rest of the market and makes the screen more stable for review.",
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
