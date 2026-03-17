const DATA_PATH = "/api/dashboard-data";

async function initLanding() {
  try {
    const response = await fetch(DATA_PATH);
    if (!response.ok) {
      throw new Error("Unable to load landing metrics.");
    }

    const data = await response.json();

    const creatorCount = document.getElementById("heroCreatorCount");
    const profileCount = document.getElementById("heroProfileCount");

    if (creatorCount) {
      creatorCount.textContent = String(data.creators.length);
    }

    if (profileCount) {
      profileCount.textContent = String(data.brandProfiles.length);
    }
  } catch (error) {
    console.error(error);
  }
}

initLanding();
