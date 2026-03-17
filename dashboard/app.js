const DATA_PATH = "/api/dashboard-data";

const quizQuestions = [
  {
    id: "objective",
    prompt: "What matters most for this campaign?",
    options: [
      { value: "sales", label: "Drive near-term sales" },
      { value: "loyalty", label: "Strengthen ecosystem loyalty" },
      { value: "awareness", label: "Expand audience reach" },
    ],
  },
  {
    id: "persona",
    prompt: "What kind of creator voice fits best?",
    options: [
      { value: "technical", label: "Technical authority" },
      { value: "lifestyle", label: "Lifestyle storyteller" },
      { value: "trend", label: "Trend-led tastemaker" },
    ],
  },
  {
    id: "posture",
    prompt: "How should the brand show up in market?",
    options: [
      { value: "broad", label: "Broad launch moment" },
      { value: "balanced", label: "Balanced portfolio mix" },
      { value: "niche", label: "High-intent niche strategy" },
    ],
  },
];

const state = {
  selectedProfileId: "brand_smart_home",
  searchTerm: "",
  selectedIndustry: "all",
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

function formatCompactNumber(value) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatInteger(value) {
  return new Intl.NumberFormat("en-US").format(Math.round(value));
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

function average(items, mapper) {
  if (items.length === 0) {
    return 0;
  }
  return items.reduce((sum, item) => sum + mapper(item), 0) / items.length;
}

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function overlapScore(leftTokens, rightTokens) {
  const rightSet = new Set(rightTokens);
  if (rightSet.size === 0) {
    return 0;
  }

  const matches = [...new Set(leftTokens)].filter((token) => rightSet.has(token)).length;
  return matches / rightSet.size;
}

function normalizeProjected(projectedScore) {
  return clamp((projectedScore - 60) / 40);
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

function getProfileDetail(id) {
  return dashboardData.brandProfiles.find((profile) => profile.id === id);
}

function getAllIndustries() {
  const industries = new Set(["all"]);
  dashboardData.creators.forEach((creator) => {
    creator.content_style_tags.forEach((tag) => industries.add(tag));
  });
  return [...industries];
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
  const overlap = [...profileAges].filter((age) => creatorAges.has(age)).length;
  const ageFit = profileAges.size === 0 ? 0 : overlap / profileAges.size;

  return clamp(0.6 * genderFit + 0.4 * ageFit);
}

function profileIndustryFit(creator, profile) {
  const creatorTags = new Set(creator.content_style_tags);
  const industries = new Set(profile.industries);
  const overlap = [...industries].filter((industry) => creatorTags.has(industry)).length;
  return industries.size === 0 ? 0 : overlap / industries.size;
}

function performanceFit(creator) {
  const projected = normalizeProjected(creator.projected_score);
  const engagement = clamp(creator.metrics.engagement_rate / 0.12);
  const gmv = clamp(Math.log1p(creator.metrics.total_gmv_30d) / Math.log1p(150000));
  return clamp(0.65 * projected + 0.2 * engagement + 0.15 * gmv);
}

function scoreCreatorForProfile(creator, profileDetail, searchTerm) {
  const profile = profileDetail.profile;
  const creatorText = `${creator.username} ${creator.bio} ${creator.content_style_tags.join(" ")}`;
  const profileText = `${profileDetail.defaultQuery} ${profileDetail.label} ${profile.industries.join(" ")} ${searchTerm}`;
  const creatorTokens = tokenize(creatorText);
  const searchTokens = tokenize(profileText);
  const queryMatch = overlapScore(creatorTokens, searchTokens);
  const industryMatch = profileIndustryFit(creator, profile);
  const audienceMatch = creatorAudienceFit(creator, profile);
  const performanceMatch = performanceFit(creator);
  const semanticScore = clamp(0.55 * industryMatch + 0.45 * queryMatch);
  const finalScore = 100 *
    clamp(
      0.38 * industryMatch +
        0.27 * queryMatch +
        0.15 * audienceMatch +
        0.2 * performanceMatch
    );

  return {
    ...creator,
    scores: {
      semantic_score: round(semanticScore, 4),
      projected_score: creator.projected_score,
      final_score: round(finalScore, 2),
    },
    _signals: {
      industryMatch,
      queryMatch,
      audienceMatch,
      performanceMatch,
    },
  };
}

function getCurrentView() {
  const profileDetail = getProfileDetail(state.selectedProfileId);
  const isOfficialScenario =
    profileDetail.id === "brand_smart_home" &&
    state.selectedIndustry === "all" &&
    state.searchTerm.trim() === "";

  if (isOfficialScenario) {
    return {
      profileDetail,
      mode: "Official challenge scenario",
      results: dashboardData.challengeOutput.results.map((result) => ({
        ...result,
        _signals: {
          industryMatch: profileIndustryFit(result, profileDetail.profile),
          queryMatch: result.scores.semantic_score,
          audienceMatch: creatorAudienceFit(result, profileDetail.profile),
          performanceMatch: performanceFit(result),
        },
      })),
    };
  }

  const searchTokens = tokenize(state.searchTerm);

  const results = dashboardData.creators
    .filter((creator) => {
      if (state.selectedIndustry === "all") {
        return true;
      }
      return creator.content_style_tags.includes(state.selectedIndustry);
    })
    .map((creator) => scoreCreatorForProfile(creator, profileDetail, state.searchTerm))
    .filter((creator) => {
      if (searchTokens.length === 0) {
        return true;
      }
      return creator._signals.queryMatch > 0;
    })
    .sort((left, right) => right.scores.final_score - left.scores.final_score)
    .slice(0, 10);

  return {
    profileDetail,
    mode: "Interactive exploration mode",
    results,
  };
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

function populateControls() {
  const profileSelect = document.getElementById("profileSelect");
  const industrySelect = document.getElementById("industrySelect");

  profileSelect.innerHTML = dashboardData.brandProfiles
    .map(
      (profile) =>
        `<option value="${profile.id}" ${profile.id === state.selectedProfileId ? "selected" : ""}>${profile.label}</option>`
    )
    .join("");

  industrySelect.innerHTML = getAllIndustries()
    .map((industry) => {
      const label = industry === "all" ? "All industries" : industry;
      return `<option value="${industry}" ${industry === state.selectedIndustry ? "selected" : ""}>${label}</option>`;
    })
    .join("");

  document.getElementById("typeSearch").value = state.searchTerm;
}

function renderProfileCards() {
  const container = document.getElementById("profileCardGrid");
  container.innerHTML = "";

  dashboardData.brandProfiles.forEach((profile) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `profile-chip ${profile.id === state.selectedProfileId ? "active" : ""}`;
    button.innerHTML = `
      <strong>${profile.label}</strong>
      <small>${profile.tagline}</small>
    `;
    button.addEventListener("click", () => {
      state.selectedProfileId = profile.id;
      state.quizStarted = false;
      state.quizStep = 0;
      state.quizAnswers = {};
      renderDashboard();
    });
    container.appendChild(button);
  });
}

function renderMetrics(view) {
  const metricGrid = document.getElementById("metricGrid");
  metricGrid.innerHTML = "";
  const { results, profileDetail } = view;
  const lead = results[0];
  const reach = results.reduce((sum, item) => sum + item.metrics.follower_count, 0);
  const gmv = results.reduce((sum, item) => sum + item.metrics.total_gmv_30d, 0);
  const avgProjected = average(results, (item) => item.projected_score);
  const avgFinal = average(results, (item) => item.scores.final_score);

  const metrics = [
    {
      label: "Lead Match",
      value: lead ? lead.username : "No result",
      copy: lead ? `${lead.scores.final_score.toFixed(2)} final score` : "Adjust filters to explore more creators",
    },
    {
      label: "Portfolio Reach",
      value: formatCompactNumber(reach),
      copy: `Top 10 creator reach for ${profileDetail.label}`,
    },
    {
      label: "30D GMV",
      value: formatCurrency(gmv),
      copy: "Aggregate commerce signal across the shortlist",
    },
    {
      label: "Average Score",
      value: avgFinal.toFixed(2),
      copy: `Average projected score ${avgProjected.toFixed(2)}`,
    },
  ];

  metrics.forEach((metric) => {
    const card = document.createElement("article");
    card.className = "metric-card";
    card.innerHTML = `
      <span class="metric-label">${metric.label}</span>
      <strong class="metric-value">${metric.value}</strong>
      <p class="detail-copy">${metric.copy}</p>
    `;
    metricGrid.appendChild(card);
  });
}

function renderFeaturedCandidate(view) {
  const featured = view.results[0];
  const container = document.getElementById("featuredCandidate");

  if (!featured) {
    container.innerHTML = "<p class='feature-description'>No creators match the current filter set.</p>";
    return;
  }

  const second = view.results[1];
  const scoreGap = second
    ? round(featured.scores.final_score - second.scores.final_score, 2)
    : 0;

  container.innerHTML = `
    <div class="feature-kicker">
      <div>
        <p class="eyebrow">Top Recommendation</p>
        <h2>${featured.username}</h2>
      </div>
      <span class="score-chip">Final ${featured.scores.final_score.toFixed(2)}</span>
    </div>
    <p class="feature-description">${featured.bio}</p>
    <div class="feature-stats">
      <span class="feature-stat">Projected ${featured.projected_score.toFixed(2)}</span>
      <span class="feature-stat">Semantic ${formatPercent(featured.scores.semantic_score)}</span>
      <span class="feature-stat">30D GMV ${formatCurrency(featured.metrics.total_gmv_30d)}</span>
      <span class="feature-stat">Reach ${formatCompactNumber(featured.metrics.follower_count)}</span>
      <span class="feature-stat">Lead margin +${scoreGap}</span>
    </div>
  `;
}

function renderInsights(view) {
  const container = document.getElementById("insightList");
  container.innerHTML = "";
  const { results, profileDetail } = view;
  const highestReach = [...results].sort(
    (left, right) => right.metrics.follower_count - left.metrics.follower_count
  )[0];
  const highestCommerce = [...results].sort(
    (left, right) => right.metrics.total_gmv_30d - left.metrics.total_gmv_30d
  )[0];
  const matchingIndustry = results.filter((item) =>
    item.content_style_tags.some((tag) => profileDetail.profile.industries.includes(tag))
  ).length;

  const insights = [
    {
      title: "Profile Alignment",
      copy: `${matchingIndustry} of the top ${results.length} creators map directly to ${profileDetail.label}'s target industries.`,
    },
    {
      title: "Commercial Anchor",
      copy: highestCommerce
        ? `${highestCommerce.username} carries the strongest 30-day GMV signal at ${formatCurrency(highestCommerce.metrics.total_gmv_30d)}.`
        : "No GMV data available for the current slice.",
    },
    {
      title: "Scale Leader",
      copy: highestReach
        ? `${highestReach.username} provides the broadest audience footprint at ${formatCompactNumber(highestReach.metrics.follower_count)} followers.`
        : "No reach leader available for the current slice.",
    },
  ];

  insights.forEach((insight) => {
    const item = document.createElement("article");
    item.className = "insight-item";
    item.innerHTML = `
      <strong>${insight.title}</strong>
      <p class="insight-copy">${insight.copy}</p>
    `;
    container.appendChild(item);
  });
}

function metricDetail(label, value, widthPercent) {
  return `
    <div class="detail-card">
      <span class="detail-label">${label}</span>
      <strong class="detail-value">${value}</strong>
      <div class="bar">
        <div class="bar-fill" style="width: ${Math.max(6, Math.min(widthPercent, 100))}%"></div>
      </div>
    </div>
  `;
}

function renderRankList(view) {
  const container = document.getElementById("rankList");
  container.innerHTML = "";

  if (view.results.length === 0) {
    container.innerHTML = "<article class='rank-card'><p class='detail-copy'>No creators match the current selection. Try broadening the keyword or industry filter.</p></article>";
    return;
  }

  view.results.forEach((result, index) => {
    const card = document.createElement("article");
    card.className = "rank-card";
    card.innerHTML = `
      <div class="rank-position">#${index + 1}</div>
      <div>
        <div class="rank-head">
          <div>
            <h3>${result.username}</h3>
            <div class="rank-tags">
              ${result.content_style_tags.map((tag) => `<span class="tag">${tag}</span>`).join("")}
            </div>
          </div>
          <span class="score-chip">Final ${result.scores.final_score.toFixed(2)}</span>
        </div>
        <p class="rank-bio">${result.bio}</p>
        <div class="detail-grid">
          ${metricDetail("Projected", result.projected_score.toFixed(2), result.projected_score)}
          ${metricDetail("Semantic", formatPercent(result.scores.semantic_score), result.scores.semantic_score * 100)}
          ${metricDetail("GMV", formatCurrency(result.metrics.total_gmv_30d), (result.metrics.total_gmv_30d / 150000) * 100)}
          ${metricDetail("Views", formatCompactNumber(result.metrics.avg_views_30d), (result.metrics.avg_views_30d / 2000000) * 100)}
        </div>
      </div>
      <aside class="rank-side">
        <label class="detail-label">Followers</label>
        <strong>${formatInteger(result.metrics.follower_count)}</strong>
        <label class="detail-label">Engagement</label>
        <strong>${formatPercent(result.metrics.engagement_rate)}</strong>
        <label class="detail-label">Audience</label>
        <strong>${result.metrics.demographics.major_gender} · ${result.metrics.demographics.age_ranges.join(", ")}</strong>
      </aside>
    `;
    container.appendChild(card);
  });
}

function dominantTags(results) {
  const counts = new Map();
  results.forEach((result) => {
    result.content_style_tags.forEach((tag) => {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    });
  });

  return [...counts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 5);
}

function renderDistribution(view) {
  const container = document.getElementById("distributionList");
  container.innerHTML = "";

  dominantTags(view.results).forEach(([tag, count]) => {
    const width = (count / Math.max(view.results.length, 1)) * 100;
    const item = document.createElement("article");
    item.className = "distribution-item";
    item.innerHTML = `
      <div>
        <strong>${tag}</strong>
        <p class="detail-copy">${count} shortlisted creators</p>
      </div>
      <div class="bar">
        <div class="bar-fill" style="width: ${width}%"></div>
      </div>
    `;
    container.appendChild(item);
  });
}

function renderScoreChart(view) {
  const container = document.getElementById("scoreChart");
  const width = 560;
  const rowHeight = 30;
  const chartHeight = view.results.length * rowHeight + 24;

  const rows = view.results
    .slice(0, 8)
    .map((result, index) => {
      const y = index * rowHeight + 10;
      const barWidth = (result.scores.final_score / 100) * 280;
      return `
        <text class="chart-label" x="0" y="${y + 10}">${result.username}</text>
        <rect x="180" y="${y}" width="300" height="12" rx="6" fill="rgba(19, 32, 51, 0.08)" />
        <rect x="180" y="${y}" width="${barWidth}" height="12" rx="6" fill="url(#scoreGradient)" />
        <text class="chart-value" x="490" y="${y + 10}">${result.scores.final_score.toFixed(2)}</text>
      `;
    })
    .join("");

  container.innerHTML = `
    <svg class="chart-svg" viewBox="0 0 ${width} ${chartHeight}" role="img" aria-label="Final score chart">
      <defs>
        <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#873d50"></stop>
          <stop offset="100%" stop-color="#b88746"></stop>
        </linearGradient>
      </defs>
      ${rows}
    </svg>
  `;
}

function renderScatterChart(view) {
  const container = document.getElementById("scatterChart");
  const width = 560;
  const height = 280;

  const maxFollowers = Math.max(...view.results.map((item) => item.metrics.follower_count), 1);
  const maxGmv = Math.max(...view.results.map((item) => item.metrics.total_gmv_30d), 1);

  const points = view.results
    .map((result) => {
      const x = 60 + (Math.log1p(result.metrics.follower_count) / Math.log1p(maxFollowers)) * 450;
      const y = 220 - (Math.log1p(result.metrics.total_gmv_30d) / Math.log1p(maxGmv)) * 170;
      return `
        <circle cx="${x}" cy="${y}" r="8" fill="#0b6f71" fill-opacity="0.78"></circle>
        <text class="chart-label" x="${x + 12}" y="${y + 4}">${result.username}</text>
      `;
    })
    .join("");

  container.innerHTML = `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Reach versus GMV scatter plot">
      <line x1="60" y1="220" x2="520" y2="220" stroke="rgba(19, 32, 51, 0.2)" />
      <line x1="60" y1="36" x2="60" y2="220" stroke="rgba(19, 32, 51, 0.2)" />
      <text class="chart-label" x="420" y="250">Higher reach</text>
      <text class="chart-label" x="8" y="36" transform="rotate(-90 8,36)">Higher GMV</text>
      ${points}
    </svg>
  `;
}

function quizAnswerLabel(questionId, value) {
  const question = quizQuestions.find((item) => item.id === questionId);
  return question?.options.find((option) => option.value === value)?.label ?? value;
}

function advisorScore(result, answers, profileDetail) {
  let score = result.scores.final_score;
  const creatorTags = new Set(result.content_style_tags);

  if (answers.objective === "sales") {
    score += normalizeProjected(result.projected_score) * 24;
    score += clamp(Math.log1p(result.metrics.total_gmv_30d) / Math.log1p(150000)) * 18;
  } else if (answers.objective === "loyalty") {
    score += result.scores.semantic_score * 22;
    score += profileIndustryFit(result, profileDetail.profile) * 18;
  } else if (answers.objective === "awareness") {
    score += clamp(Math.log1p(result.metrics.follower_count) / Math.log1p(2000000)) * 24;
    score += clamp(Math.log1p(result.metrics.avg_views_30d) / Math.log1p(2000000)) * 16;
  }

  if (answers.persona === "technical") {
    if (
      creatorTags.has("Phones & Electronics") ||
      creatorTags.has("Computer & Office Equipment") ||
      creatorTags.has("Tools & Hardware")
    ) {
      score += 18;
    }
  } else if (answers.persona === "lifestyle") {
    if (
      creatorTags.has("Home") ||
      creatorTags.has("Food & Beverage") ||
      creatorTags.has("Beauty") ||
      creatorTags.has("Fashion")
    ) {
      score += 16;
    }
  } else if (answers.persona === "trend") {
    if (
      creatorTags.has("Fashion") ||
      creatorTags.has("Beauty") ||
      creatorTags.has("Phones & Electronics")
    ) {
      score += 16;
    }
    score += clamp(result.metrics.engagement_rate / 0.12) * 10;
  }

  if (answers.posture === "broad") {
    score += clamp(Math.log1p(result.metrics.follower_count) / Math.log1p(2000000)) * 18;
  } else if (answers.posture === "balanced") {
    score += performanceFit(result) * 14;
  } else if (answers.posture === "niche") {
    score += clamp(result.metrics.engagement_rate / 0.12) * 14;
    score += clamp(Math.log1p(result.metrics.gpm) / Math.log1p(25)) * 10;
  }

  return score;
}

function buildAdvice(view) {
  const ranked = [...view.results]
    .map((result) => ({
      result,
      advisorScore: advisorScore(result, state.quizAnswers, view.profileDetail),
    }))
    .sort((left, right) => right.advisorScore - left.advisorScore);

  const topThree = ranked.slice(0, 3).map((item) => item.result);
  const profileLabel = view.profileDetail.label;
  const tone =
    state.quizAnswers.persona === "technical"
      ? "credibility-first"
      : state.quizAnswers.persona === "lifestyle"
        ? "integration-led"
        : "momentum-driven";
  const focus =
    state.quizAnswers.objective === "sales"
      ? "conversion"
      : state.quizAnswers.objective === "loyalty"
        ? "ecosystem retention"
        : "reach expansion";

  return {
    headline: `${profileLabel}: ${focus} recommendation`,
    copy: `For a ${profileLabel} brief with a ${tone} creator voice and a ${quizAnswerLabel("posture", state.quizAnswers.posture).toLowerCase()}, the best mix is to anchor the campaign on ${topThree[0]?.username ?? "the current top match"} and support with creators who widen either reach or conversion depth.`,
    tags: [
      quizAnswerLabel("objective", state.quizAnswers.objective),
      quizAnswerLabel("persona", state.quizAnswers.persona),
      quizAnswerLabel("posture", state.quizAnswers.posture),
    ],
    recommendations: topThree,
  };
}

function renderAdvisor(view) {
  const quizMount = document.getElementById("quizMount");
  const advisorOutput = document.getElementById("advisorOutput");
  advisorOutput.innerHTML = "";

  if (!state.quizStarted) {
    quizMount.innerHTML = `
      <article class="quiz-card">
        <span class="quiz-kicker">Interactive Walkthrough</span>
        <h3>Would you like to take a quiz?</h3>
        <p class="quiz-copy">Use the current brand profile, answer three questions, and Atlas Advisor will recommend the right creator strategy for the moment.</p>
        <button class="quiz-cta" id="startQuizButton" type="button">Start the quiz</button>
      </article>
    `;
    document.getElementById("startQuizButton").addEventListener("click", () => {
      state.quizStarted = true;
      state.quizStep = 0;
      state.quizAnswers = {};
      renderDashboard();
    });
    return;
  }

  const question = quizQuestions[state.quizStep];
  const selectedValue = state.quizAnswers[question.id];

  quizMount.innerHTML = `
    <article class="quiz-card">
      <span class="quiz-step">Question ${state.quizStep + 1} of ${quizQuestions.length}</span>
      <h3>${question.prompt}</h3>
      <div class="quiz-progress">
        ${quizQuestions
          .map(
            (_, index) =>
              `<span class="quiz-dot ${index <= state.quizStep ? "active" : ""}"></span>`
          )
          .join("")}
      </div>
      <div class="quiz-options">
        ${question.options
          .map(
            (option) => `
              <button class="quiz-option ${selectedValue === option.value ? "selected" : ""}" data-option="${option.value}" type="button">
                ${option.label}
              </button>
            `
          )
          .join("")}
      </div>
      <div class="feature-stats">
        <button class="quiz-reset" id="resetQuizButton" type="button">Reset quiz</button>
      </div>
    </article>
  `;

  document.querySelectorAll(".quiz-option").forEach((button) => {
    button.addEventListener("click", () => {
      state.quizAnswers[question.id] = button.dataset.option;
      if (state.quizStep < quizQuestions.length - 1) {
        state.quizStep += 1;
        renderDashboard();
      } else {
        const advice = buildAdvice(view);
        renderDashboard();
        advisorOutput.innerHTML = `
          <article class="advice-card">
            <span class="quiz-kicker">Advisor Recommendation</span>
            <h3>${advice.headline}</h3>
            <p class="advice-copy">${advice.copy}</p>
            <div class="advice-tags">
              ${advice.tags.map((tag) => `<span class="advice-tag">${tag}</span>`).join("")}
            </div>
            <div class="insight-list">
              ${advice.recommendations
                .map(
                  (creator, index) => `
                    <article class="insight-item">
                      <strong>Priority ${index + 1}: ${creator.username}</strong>
                      <p class="insight-copy">${creator.bio}</p>
                    </article>
                  `
                )
                .join("")}
            </div>
          </article>
        `;
      }
    });
  });

  document.getElementById("resetQuizButton").addEventListener("click", () => {
    state.quizStarted = false;
    state.quizStep = 0;
    state.quizAnswers = {};
    renderDashboard();
  });
}

function renderChecklist() {
  const checklist = document.getElementById("checklistGrid");
  checklist.innerHTML = "";

  const items = [
    { title: "Vector DB setup", status: "Complete", copy: "Postgres + pgvector schema and retrieval backend are implemented." },
    { title: "Ingestion script", status: "Complete", copy: "Creator ingestion and embedding storage are implemented in scripts/ingest.ts." },
    { title: "searchCreators", status: "Complete", copy: "Hybrid retrieval and convex-score ranking are implemented." },
    { title: "Hybrid scoring", status: "Complete", copy: "The convex fusion formula is implemented and documented." },
    { title: "Output JSON", status: "Complete", copy: "The required top-10 output file is generated into output/brand_smart_home_top10.json." },
    { title: "Loom walkthrough", status: "Pending", copy: "The repo cannot generate the 2-minute Loom video automatically." },
  ];

  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "check-card";
    card.innerHTML = `
      <span class="check-status">${item.status}</span>
      <strong>${item.title}</strong>
      <p class="detail-copy">${item.copy}</p>
    `;
    checklist.appendChild(card);
  });
}

function renderMethodPills(view) {
  const container = document.getElementById("methodPills");
  container.innerHTML = "";
  [
    `Mode: ${view.mode}`,
    `Profile: ${view.profileDetail.label}`,
    `Filter: ${state.selectedIndustry === "all" ? "All industries" : state.selectedIndustry}`,
    `Search: ${state.searchTerm.trim() || "None"}`,
  ].forEach((label) => {
    const pill = document.createElement("span");
    pill.className = "pill";
    pill.textContent = label;
    container.appendChild(pill);
  });
}

function renderHeaderMeta(view) {
  const generatedAt = new Date(dashboardData.challengeOutput.generated_at).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  setText("activeBrandLabel", view.profileDetail.label);
  setText("scenarioMode", view.mode);
  setText("generatedAt", generatedAt);
  setText("portfolioSummary", `${view.profileDetail.tagline} ${state.searchTerm ? `Filtered for "${state.searchTerm}".` : ""}`);
  setText("modeBadge", view.mode);
}

function renderDashboard() {
  populateControls();
  renderProfileCards();
  const view = getCurrentView();
  renderHeaderMeta(view);
  renderMetrics(view);
  renderFeaturedCandidate(view);
  renderInsights(view);
  renderRankList(view);
  renderDistribution(view);
  renderScoreChart(view);
  renderScatterChart(view);
  renderAdvisor(view);
  renderChecklist();
  renderMethodPills(view);
}

function attachEvents() {
  document.getElementById("profileSelect").addEventListener("change", (event) => {
    state.selectedProfileId = event.target.value;
    state.quizStarted = false;
    state.quizStep = 0;
    state.quizAnswers = {};
    renderDashboard();
  });

  document.getElementById("industrySelect").addEventListener("change", (event) => {
    state.selectedIndustry = event.target.value;
    renderDashboard();
  });

  document.getElementById("typeSearch").addEventListener("input", (event) => {
    state.searchTerm = event.target.value;
    renderDashboard();
  });
}

async function init() {
  try {
    const response = await fetch(DATA_PATH);
    if (!response.ok) {
      throw new Error(`Unable to load dashboard data (${response.status})`);
    }

    dashboardData = await response.json();
    attachEvents();
    renderDashboard();
  } catch (error) {
    document.body.innerHTML = `
      <main class="page-shell">
        <section class="panel">
          <p class="eyebrow">Atlas Brief</p>
          <h1>Dashboard unavailable</h1>
          <p class="hero-summary">${error instanceof Error ? error.message : "Unknown loading error"}</p>
          <p class="hero-summary">Run the demo first so the output JSON exists, then reload the dashboard.</p>
        </section>
      </main>
    `;
  }
}

init();
