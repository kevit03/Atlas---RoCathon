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
        item.href
          ? `<a class="reference-link" href="${item.href}" target="_blank" rel="noreferrer">Open source</a>`
          : ""
      }
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
        <span class="detail-copy">Creators screened.</span>
      </div>
      <div class="hero-metric">
        <strong>50</strong>
        <span class="detail-copy">Semantic candidates returned before reranking.</span>
      </div>
      <div class="hero-metric">
        <strong>0.45 / 0.55</strong>
        <span class="detail-copy">Official hybrid weights.</span>
      </div>
      <div class="hero-metric">
        <strong>3</strong>
        <span class="detail-copy">Primary research links.</span>
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
        href: "https://arxiv.org/abs/2210.11934",
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
        href: "https://arxiv.org/abs/2210.11934",
        details:
          "The paper 'An Analysis of Fusion Functions for Hybrid Retrieval' motivates the family of score fusion methods used by the official challenge ranker.",
      },
      {
        status: "Paper",
        title: "Cormack et al. (2009)",
        copy: "Defines Reciprocal Rank Fusion, the classic rank-only baseline.",
        href: "https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf",
        details:
          "Atlas references RRF as the comparison point, but does not use it in the final challenge ranker because rank-only fusion would throw away the magnitude of projected_score.",
      },
      {
        status: "System",
        title: "pgvector",
        copy: "The vector layer uses cosine-distance search in Postgres.",
        href: "https://github.com/pgvector/pgvector",
        details:
          "The official submission path stores creator embeddings in Postgres with pgvector, then retrieves nearest neighbors by cosine distance before applying the hybrid reranker.",
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
