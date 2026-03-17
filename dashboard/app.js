const DATA_PATH = "/api/dashboard-data";

const quizQuestions = [
  {
    id: "objective",
    prompt: "What is the primary business objective?",
    options: [
      { value: "sales", label: "Drive near-term revenue" },
      { value: "loyalty", label: "Increase ecosystem loyalty" },
      { value: "awareness", label: "Expand top-of-funnel reach" },
    ],
  },
  {
    id: "voice",
    prompt: "What type of creator voice do you want?",
    options: [
      { value: "technical", label: "Technical authority" },
      { value: "lifestyle", label: "Lifestyle integration" },
      { value: "trend", label: "Trend-led tastemaker" },
    ],
  },
  {
    id: "rollout",
    prompt: "How concentrated should the plan be?",
    options: [
      { value: "broad", label: "Broad market launch" },
      { value: "balanced", label: "Balanced portfolio" },
      { value: "niche", label: "High-intent niche focus" },
    ],
  },
];

const state = {
  selectedProfileId: "brand_smart_home",
  selectedIndustry: "all",
  searchTerm: "",
  quizStarted: false,
  quizStep: 0,
  quizAnswers: {},
};

let dashboardData = null;

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 2) {
  const precision = 10 ** digits;
  return Math.round(value * precision) / precision;
}

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function overlapScore(sourceTokens, targetTokens) {
  const targetSet = new Set(targetTokens);
  if (targetSet.size === 0) {
    return 0;
  }
  const matches = [...new Set(sourceTokens)].filter((token) => targetSet.has(token)).length;
  return matches / targetSet.size;
}

function normalizeProjected(score) {
  return clamp((score - 60) / 40);
}

function normalizeLog(value, maxValue) {
  if (maxValue <= 0) {
    return 0;
  }
  return clamp(Math.log1p(value) / Math.log1p(maxValue));
}

function normalizeGenderShare(value) {
  if (value <= 1) {
    return value;
  }
  if (value <= 100) {
    return value / 100;
  }
  return value / 10000;
}

function formatCompactNumber(value) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: value >= 100000 ? "compact" : "standard",
    maximumFractionDigits: value >= 100000 ? 1 : 0,
  }).format(value);
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function percentile(sortedValues, pct) {
  if (sortedValues.length === 0) {
    return 0;
  }
  const index = Math.floor(clamp(pct, 0, 1) * (sortedValues.length - 1));
  return sortedValues[index];
}

function average(items, mapper) {
  if (items.length === 0) {
    return 0;
  }
  return items.reduce((sum, item) => sum + mapper(item), 0) / items.length;
}

function getProfileDetail(id) {
  return dashboardData.brandProfiles.find((profile) => profile.id === id);
}

function creatorAudienceFit(creator, profile) {
  const demographics = creator.metrics.demographics;
  const dominantGenderShare = normalizeGenderShare(demographics.gender_pct);
  const genderFit =
    demographics.major_gender === profile.target_audience.gender
      ? dominantGenderShare
      : 1 - dominantGenderShare;

  const creatorAges = new Set(demographics.age_ranges);
  const profileAges = new Set(profile.target_audience.age_ranges);
  const overlap = [...profileAges].filter((ageRange) => creatorAges.has(ageRange)).length;
  const ageFit = profileAges.size === 0 ? 0 : overlap / profileAges.size;

  return clamp(0.6 * genderFit + 0.4 * ageFit);
}

function industryFit(creator, profile) {
  const creatorTags = new Set(creator.content_style_tags);
  const profileIndustries = new Set(profile.industries);
  const overlap = [...profileIndustries].filter((industry) => creatorTags.has(industry)).length;
  return profileIndustries.size === 0 ? 0 : overlap / profileIndustries.size;
}

function buildUniverse(profileDetail) {
  const searchTokens = tokenize(`${profileDetail.defaultQuery} ${state.searchTerm} ${profileDetail.label}`);
  const filteredCreators = dashboardData.creators.filter((creator) => {
    if (state.selectedIndustry === "all") {
      return true;
    }
    return creator.content_style_tags.includes(state.selectedIndustry);
  });

  const maxGmv = Math.max(...filteredCreators.map((creator) => creator.metrics.total_gmv_30d), 1);
  const maxViews = Math.max(...filteredCreators.map((creator) => creator.metrics.avg_views_30d), 1);
  const maxFollowers = Math.max(...filteredCreators.map((creator) => creator.metrics.follower_count), 1);

  const scored = filteredCreators
    .map((creator) => {
      const creatorTokens = tokenize(
        `${creator.username} ${creator.bio} ${creator.content_style_tags.join(" ")}`
      );
      const queryOverlap = overlapScore(creatorTokens, searchTokens);
      const industry = industryFit(creator, profileDetail.profile);
      const audience = creatorAudienceFit(creator, profileDetail.profile);
      const commercialIndex =
        0.65 * normalizeProjected(creator.projected_score) +
        0.2 * clamp(creator.metrics.engagement_rate / 0.12) +
        0.15 * normalizeLog(creator.metrics.total_gmv_30d, maxGmv);
      const efficiencyIndex =
        0.5 * clamp(creator.metrics.engagement_rate / 0.12) +
        0.25 * normalizeLog(creator.metrics.gpm, 50) +
        0.25 * clamp(
          creator.metrics.follower_count === 0
            ? 0
            : creator.metrics.total_gmv_30d / creator.metrics.follower_count / 0.15
        );
      const semanticProxy = 0.55 * industry + 0.45 * queryOverlap;
      const atlasScore =
        100 *
        clamp(
          0.38 * industry +
            0.27 * queryOverlap +
            0.15 * audience +
            0.2 * commercialIndex
        );

      return {
        ...creator,
        atlasScore: round(atlasScore, 2),
        diagnostics: {
          semanticProxy: round(semanticProxy, 4),
          industryFit: round(industry, 4),
          queryOverlap: round(queryOverlap, 4),
          audienceFit: round(audience, 4),
          commercialIndex: round(commercialIndex, 4),
          efficiencyIndex: round(efficiencyIndex, 4),
          gmvNorm: round(normalizeLog(creator.metrics.total_gmv_30d, maxGmv), 4),
          viewsNorm: round(normalizeLog(creator.metrics.avg_views_30d, maxViews), 4),
          followersNorm: round(normalizeLog(creator.metrics.follower_count, maxFollowers), 4),
        },
      };
    })
    .filter((creator) => {
      const keywordTokens = tokenize(state.searchTerm);
      if (keywordTokens.length === 0) {
        return true;
      }
      return creator.diagnostics.queryOverlap > 0;
    })
    .sort((left, right) => right.atlasScore - left.atlasScore);

  return {
    all: scored,
    top: scored.slice(0, 20),
    topTen: scored.slice(0, 10),
  };
}

function getCurrentView() {
  const profileDetail = getProfileDetail(state.selectedProfileId);
  const universe = buildUniverse(profileDetail);

  return {
    profileDetail,
    universe,
    mode:
      state.searchTerm || state.selectedIndustry !== "all"
        ? "Filtered market scan"
        : "Full universe screen",
  };
}

function getIndustries() {
  const industries = new Set(["all"]);
  dashboardData.creators.forEach((creator) => {
    creator.content_style_tags.forEach((tag) => industries.add(tag));
  });
  return [...industries];
}

function renderControls() {
  const profileSelect = document.getElementById("profileSelect");
  const industrySelect = document.getElementById("industrySelect");
  const typeSearch = document.getElementById("typeSearch");

  profileSelect.innerHTML = dashboardData.brandProfiles
    .map(
      (profile) =>
        `<option value="${profile.id}" ${profile.id === state.selectedProfileId ? "selected" : ""}>${profile.label}</option>`
    )
    .join("");

  industrySelect.innerHTML = getIndustries()
    .map((industry) => {
      const label = industry === "all" ? "All industries" : industry;
      return `<option value="${industry}" ${industry === state.selectedIndustry ? "selected" : ""}>${label}</option>`;
    })
    .join("");

  typeSearch.value = state.searchTerm;
}

function renderHeader(view) {
  const generatedAt = new Date(dashboardData.challengeOutput.generated_at).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  document.getElementById("activeProfileLabel").textContent = view.profileDetail.label;
  document.getElementById("universeCount").textContent = `${view.universe.all.length} creators`;
  document.getElementById("generatedAt").textContent = generatedAt;
  document.getElementById("scenarioMode").textContent = view.mode;
  document.getElementById(
    "analyticsCaption"
  ).textContent = `${view.profileDetail.tagline} ${state.searchTerm ? `Keyword filter: "${state.searchTerm}".` : ""}`;
}

function renderKpis(view) {
  const container = document.getElementById("kpiGrid");
  container.innerHTML = "";

  const scores = view.universe.all.map((creator) => creator.atlasScore).sort((a, b) => b - a);
  const topCreator = view.universe.top[0];
  const totalTopTenGmv = view.universe.topTen.reduce(
    (sum, creator) => sum + creator.metrics.total_gmv_30d,
    0
  );
  const medianProjected = average(view.universe.all, (creator) => creator.projected_score);
  const p90 = percentile(scores, 0.1);
  const avgEngagement = average(
    view.universe.all,
    (creator) => creator.metrics.engagement_rate
  );

  const cards = [
    {
      label: "Top candidate",
      value: topCreator ? topCreator.username : "None",
      copy: topCreator ? `${topCreator.atlasScore.toFixed(2)} atlas score` : "No creator matches the filters",
    },
    {
      label: "P90 threshold",
      value: p90.toFixed(2),
      copy: "Top-decile score cutoff across the filtered universe",
    },
    {
      label: "Top 10 GMV",
      value: formatCurrency(totalTopTenGmv),
      copy: "Combined 30-day GMV across the leading shortlist",
    },
    {
      label: "Median projected",
      value: medianProjected.toFixed(2),
      copy: "Average projected score across the current universe slice",
    },
    {
      label: "Avg engagement",
      value: formatPercent(avgEngagement),
      copy: "Mean engagement rate across the filtered universe",
    },
  ];

  cards.forEach((card) => {
    const article = document.createElement("article");
    article.className = "kpi-card";
    article.innerHTML = `
      <div class="kpi-label">${card.label}</div>
      <div class="kpi-value">${card.value}</div>
      <p class="detail-copy">${card.copy}</p>
    `;
    container.appendChild(article);
  });
}

function renderScoreDistribution(view) {
  const container = document.getElementById("scoreDistribution");
  const width = 700;
  const height = 300;
  const values = view.universe.all.map((creator) => creator.atlasScore).sort((a, b) => b - a);

  if (values.length === 0) {
    container.innerHTML = "<p class='detail-copy'>No data available.</p>";
    return;
  }

  const points = values
    .map((value, index) => {
      const x = 30 + (index / Math.max(values.length - 1, 1)) * 620;
      const y = 240 - (value / 100) * 180;
      return `${x},${y}`;
    })
    .join(" ");

  const topValue = values[0];
  const medianValue = values[Math.floor(values.length / 2)];
  const p90 = percentile(values, 0.1);

  container.innerHTML = `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Universe score ladder">
      <line x1="30" y1="240" x2="670" y2="240" stroke="#d7dce5"></line>
      <line x1="30" y1="60" x2="30" y2="240" stroke="#d7dce5"></line>
      <polyline fill="none" stroke="#0f2f7a" stroke-width="2.5" points="${points}"></polyline>
      <text class="chart-label" x="30" y="26">Top ${topValue.toFixed(2)}</text>
      <text class="chart-label" x="260" y="26">P90 ${p90.toFixed(2)}</text>
      <text class="chart-label" x="520" y="26">Median ${medianValue.toFixed(2)}</text>
      <text class="chart-label" x="30" y="260">Ranked creators</text>
      <text class="chart-label" x="610" y="260">Lower score</text>
    </svg>
  `;
}

function renderScatterPlot(view) {
  const container = document.getElementById("scatterPlot");
  const width = 700;
  const height = 300;
  const maxFollowers = Math.max(
    ...view.universe.all.map((creator) => creator.metrics.follower_count),
    1
  );
  const maxGmv = Math.max(
    ...view.universe.all.map((creator) => creator.metrics.total_gmv_30d),
    1
  );
  const highlightIds = new Set(view.universe.top.slice(0, 5).map((creator) => creator.username));

  const points = view.universe.all
    .map((creator) => {
      const x = 50 + normalizeLog(creator.metrics.follower_count, maxFollowers) * 600;
      const y = 235 - normalizeLog(creator.metrics.total_gmv_30d, maxGmv) * 175;
      const fill = highlightIds.has(creator.username) ? "#0f2f7a" : "#a8b3c7";
      const radius = highlightIds.has(creator.username) ? 5.4 : 3.1;
      return `<circle cx="${x}" cy="${y}" r="${radius}" fill="${fill}" fill-opacity="0.9"></circle>`;
    })
    .join("");

  const labels = view.universe.top
    .slice(0, 5)
    .map((creator) => {
      const x = 50 + normalizeLog(creator.metrics.follower_count, maxFollowers) * 600;
      const y = 235 - normalizeLog(creator.metrics.total_gmv_30d, maxGmv) * 175;
      return `<text class="chart-label" x="${x + 8}" y="${y + 4}">${creator.username}</text>`;
    })
    .join("");

  container.innerHTML = `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Reach versus GMV">
      <line x1="50" y1="235" x2="660" y2="235" stroke="#d7dce5"></line>
      <line x1="50" y1="40" x2="50" y2="235" stroke="#d7dce5"></line>
      <text class="chart-label" x="540" y="262">Higher follower scale</text>
      <text class="chart-label" x="16" y="52" transform="rotate(-90 16,52)">Higher 30D GMV</text>
      ${points}
      ${labels}
    </svg>
  `;
}

function renderIndustryMix(view) {
  const container = document.getElementById("industryMix");
  container.innerHTML = "";

  const counts = new Map();
  view.universe.all.forEach((creator) => {
    creator.content_style_tags.forEach((tag) => {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    });
  });

  [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .forEach(([tag, count]) => {
      const item = document.createElement("article");
      item.className = "mix-item";
      item.innerHTML = `
        <strong>${tag}</strong>
        <div class="bar"><span style="width: ${(count / view.universe.all.length) * 100}%"></span></div>
        <p class="detail-copy">${count} creators in the active universe slice</p>
      `;
      container.appendChild(item);
    });
}

function renderSummaryRail(view) {
  const container = document.getElementById("summaryRail");
  container.innerHTML = "";

  const topGmv = [...view.universe.top].sort(
    (left, right) => right.metrics.total_gmv_30d - left.metrics.total_gmv_30d
  )[0];
  const topEngagement = [...view.universe.top].sort(
    (left, right) => right.metrics.engagement_rate - left.metrics.engagement_rate
  )[0];
  const topEfficiency = [...view.universe.top].sort(
    (left, right) => right.diagnostics.efficiencyIndex - left.diagnostics.efficiencyIndex
  )[0];
  const concentration = average(
    view.universe.topTen,
    (creator) => creator.diagnostics.industryFit
  );

  const items = [
    {
      title: "Top GMV leader",
      copy: topGmv ? `${topGmv.username} at ${formatCurrency(topGmv.metrics.total_gmv_30d)}` : "No result",
    },
    {
      title: "Top engagement",
      copy: topEngagement ? `${topEngagement.username} at ${formatPercent(topEngagement.metrics.engagement_rate)}` : "No result",
    },
    {
      title: "Top efficiency",
      copy: topEfficiency ? `${topEfficiency.username} at ${topEfficiency.diagnostics.efficiencyIndex.toFixed(2)}` : "No result",
    },
    {
      title: "Category concentration",
      copy: `${(concentration * 100).toFixed(1)}% average industry alignment across the top 10`,
    },
  ];

  items.forEach((item) => {
    const article = document.createElement("article");
    article.className = "summary-item";
    article.innerHTML = `
      <strong>${item.title}</strong>
      <p class="detail-copy">${item.copy}</p>
    `;
    container.appendChild(article);
  });
}

function renderLeaderboard(view) {
  const tbody = document.getElementById("leaderboardBody");
  tbody.innerHTML = "";

  view.universe.top.forEach((creator, index) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${index + 1}</td>
      <td class="rank-cell">
        <strong>${creator.username}</strong>
        <span class="detail-copy">${creator.bio}</span>
      </td>
      <td>
        <div class="industry-badges">
          ${creator.content_style_tags.map((tag) => `<span class="industry-badge">${tag}</span>`).join("")}
        </div>
      </td>
      <td>${creator.atlasScore.toFixed(2)}</td>
      <td>${creator.projected_score.toFixed(2)}</td>
      <td>${formatCurrency(creator.metrics.total_gmv_30d)}</td>
      <td>${formatCompactNumber(creator.metrics.avg_views_30d)}</td>
      <td>${formatPercent(creator.metrics.engagement_rate)}</td>
    `;
    tbody.appendChild(row);
  });
}

function quizLabel(questionId, value) {
  return (
    quizQuestions
      .find((question) => question.id === questionId)
      ?.options.find((option) => option.value === value)?.label ?? value
  );
}

function advisorScore(creator, answers, profileDetail) {
  let score = creator.atlasScore;

  if (answers.objective === "sales") {
    score += creator.diagnostics.gmvNorm * 20 + normalizeProjected(creator.projected_score) * 18;
  } else if (answers.objective === "loyalty") {
    score += creator.diagnostics.semanticProxy * 22 + creator.diagnostics.industryFit * 14;
  } else if (answers.objective === "awareness") {
    score += creator.diagnostics.followersNorm * 18 + creator.diagnostics.viewsNorm * 16;
  }

  if (answers.voice === "technical") {
    if (
      creator.content_style_tags.includes("Phones & Electronics") ||
      creator.content_style_tags.includes("Computer & Office Equipment") ||
      creator.content_style_tags.includes("Tools & Hardware")
    ) {
      score += 16;
    }
  } else if (answers.voice === "lifestyle") {
    if (
      creator.content_style_tags.includes("Home") ||
      creator.content_style_tags.includes("Food & Beverage") ||
      creator.content_style_tags.includes("Beauty") ||
      creator.content_style_tags.includes("Fashion")
    ) {
      score += 16;
    }
  } else if (answers.voice === "trend") {
    score += clamp(creator.metrics.engagement_rate / 0.12) * 12;
    if (
      creator.content_style_tags.includes("Fashion") ||
      creator.content_style_tags.includes("Beauty") ||
      creator.content_style_tags.includes("Phones & Electronics")
    ) {
      score += 14;
    }
  }

  if (answers.rollout === "broad") {
    score += creator.diagnostics.followersNorm * 16;
  } else if (answers.rollout === "balanced") {
    score += creator.diagnostics.commercialIndex * 14;
  } else if (answers.rollout === "niche") {
    score += creator.diagnostics.efficiencyIndex * 18;
  }

  return score;
}

function renderAdvisor(view) {
  const quizMount = document.getElementById("quizMount");
  const advisorOutput = document.getElementById("advisorOutput");

  if (!state.quizStarted) {
    quizMount.innerHTML = `
      <div class="panel-label">Walkthrough</div>
      <h3>Would you like to take a quiz?</h3>
      <p class="quiz-copy">Answer three multiple-choice questions and Atlas Advisor will recommend a campaign posture for ${view.profileDetail.label.toLowerCase()}.</p>
      <button class="quiz-button primary" id="startQuizButton" type="button">Start the quiz</button>
    `;

    advisorOutput.innerHTML = `
      <div class="panel-label">Advisor preview</div>
      <h3>What you will get</h3>
      <p class="advice-copy">A recommendation set, campaign posture, and creator stack tuned to the selected profile and your stated objective.</p>
    `;

    document.getElementById("startQuizButton").addEventListener("click", () => {
      state.quizStarted = true;
      state.quizStep = 0;
      state.quizAnswers = {};
      render();
    });
    return;
  }

  const question = quizQuestions[state.quizStep];
  const selected = state.quizAnswers[question.id];

  quizMount.innerHTML = `
    <div class="panel-label">Question ${state.quizStep + 1} of ${quizQuestions.length}</div>
    <h3>${question.prompt}</h3>
    <div class="quiz-options">
      ${question.options
        .map(
          (option) => `
            <button class="quiz-option ${selected === option.value ? "selected" : ""}" data-value="${option.value}" type="button">
              ${option.label}
            </button>
          `
        )
        .join("")}
    </div>
    <div style="margin-top:16px">
      <button class="quiz-button secondary" id="resetQuizButton" type="button">Reset</button>
    </div>
  `;

  document.querySelectorAll(".quiz-option").forEach((button) => {
    button.addEventListener("click", () => {
      state.quizAnswers[question.id] = button.dataset.value;
      if (state.quizStep < quizQuestions.length - 1) {
        state.quizStep += 1;
      }
      render();
    });
  });

  document.getElementById("resetQuizButton").addEventListener("click", () => {
    state.quizStarted = false;
    state.quizStep = 0;
    state.quizAnswers = {};
    render();
  });

  if (Object.keys(state.quizAnswers).length === quizQuestions.length) {
    const ranked = [...view.universe.top]
      .map((creator) => ({
        creator,
        advisorScore: advisorScore(creator, state.quizAnswers, view.profileDetail),
      }))
      .sort((left, right) => right.advisorScore - left.advisorScore)
      .slice(0, 3)
      .map((entry) => entry.creator);

    advisorOutput.innerHTML = `
      <div class="panel-label">Advisor recommendation</div>
      <h3>${view.profileDetail.label}: ${quizLabel("objective", state.quizAnswers.objective)}</h3>
      <p class="advice-copy">For a ${view.profileDetail.label.toLowerCase()} campaign with a ${quizLabel("voice", state.quizAnswers.voice).toLowerCase()} creative posture and a ${quizLabel("rollout", state.quizAnswers.rollout).toLowerCase()}, prioritize creators who score well on both business efficiency and profile fit.</p>
      <div class="advisor-badges">
        <span class="advisor-badge">${quizLabel("objective", state.quizAnswers.objective)}</span>
        <span class="advisor-badge">${quizLabel("voice", state.quizAnswers.voice)}</span>
        <span class="advisor-badge">${quizLabel("rollout", state.quizAnswers.rollout)}</span>
      </div>
      <div class="advisor-list">
        ${ranked
          .map(
            (creator, index) => `
              <article class="advisor-pick">
                <strong>${index + 1}. ${creator.username}</strong>
                <p class="detail-copy">${creator.bio}</p>
              </article>
            `
          )
          .join("")}
      </div>
    `;
  } else {
    advisorOutput.innerHTML = `
      <div class="panel-label">Advisor recommendation</div>
      <h3>Waiting for inputs</h3>
      <p class="advice-copy">Complete the quiz to generate a recommendation set.</p>
    `;
  }
}

function attachEvents() {
  document.getElementById("profileSelect").addEventListener("change", (event) => {
    state.selectedProfileId = event.target.value;
    state.quizStarted = false;
    state.quizStep = 0;
    state.quizAnswers = {};
    render();
  });

  document.getElementById("industrySelect").addEventListener("change", (event) => {
    state.selectedIndustry = event.target.value;
    render();
  });

  document.getElementById("typeSearch").addEventListener("input", (event) => {
    state.searchTerm = event.target.value;
    render();
  });
}

function render() {
  renderControls();
  const view = getCurrentView();
  renderHeader(view);
  renderKpis(view);
  renderScoreDistribution(view);
  renderScatterPlot(view);
  renderIndustryMix(view);
  renderSummaryRail(view);
  renderLeaderboard(view);
  renderAdvisor(view);
}

async function init() {
  try {
    const response = await fetch(DATA_PATH);
    if (!response.ok) {
      throw new Error(`Unable to load dashboard data (${response.status})`);
    }

    dashboardData = await response.json();
    attachEvents();
    render();
  } catch (error) {
    document.body.innerHTML = `
      <main class="app-shell">
        <section class="section">
          <h1>Dashboard unavailable</h1>
          <p class="hero-text">${error instanceof Error ? error.message : "Unknown loading error"}</p>
        </section>
      </main>
    `;
  }
}

init();
