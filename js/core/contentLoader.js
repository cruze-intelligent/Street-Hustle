const CONTENT_PATHS = {
    districts: "../../data/districts.json",
    hustles: "../../data/hustles.json",
    missions: "../../data/missions.json",
    events: "../../data/events.json",
    studio: "../../data/studio.json"
};

async function fetchJson(relativePath) {
    const url = new URL(relativePath, import.meta.url);
    const response = await fetch(url.href, { cache: "no-store" });
    if (!response.ok) {
        throw new Error(`Failed to load content from ${url.pathname}`);
    }
    return response.json();
}

export async function loadContent() {
    const [districts, hustles, missionBundle, events, studio] = await Promise.all([
        fetchJson(CONTENT_PATHS.districts),
        fetchJson(CONTENT_PATHS.hustles),
        fetchJson(CONTENT_PATHS.missions),
        fetchJson(CONTENT_PATHS.events),
        fetchJson(CONTENT_PATHS.studio)
    ]);

    return {
        districts,
        districtsById: Object.fromEntries(districts.map((district) => [district.id, district])),
        hustles,
        hustlesById: Object.fromEntries(hustles.map((hustle) => [hustle.id, hustle])),
        missions: missionBundle.missions,
        achievements: missionBundle.achievements,
        events,
        studio
    };
}
