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
        status: "Priority",
        title: "Largest weight: fit",
        copy: "Profile fit gets the largest weight so off-brief creators do not rise on scale alone.",
        details:
          "Atlas is a screening layer, so it needs to protect contextual fit first. High reach or GMV can be attractive, but if the creator misses the category the shortlist becomes harder to defend.",
      },
      {
        status: "Balance",
        title: "Query stays second",
        copy: "Query overlap matters, but it sits below durable profile fit.",
        details:
          "Campaign wording should influence the screen, but short prompt phrasing should not overpower the broader brand category. That is why query overlap remains below industry fit in Atlas.",
      },
      {
        status: "Commercial",
        title: "Nested commercial block",
        copy: "Commercial quality is capped, then divided across projected score, engagement, and GMV.",
        details:
          "Projected score leads the block because it is already a forward-looking business indicator from RoC. Engagement adds creator quality and GMV adds evidence of conversion, but neither is allowed to dominate the screen.",
      },
    ]);

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
