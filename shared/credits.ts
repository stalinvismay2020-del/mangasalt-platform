// Public credit lines for openly licensed series hosted on MANGASALT.
// Licences require these to be shown wherever the work is shown.
export type Credit = { work: string; author: string; license: string; licenseUrl?: string; source: string; sourceUrl: string; note?: string };

export const CREDITS: Record<string, Credit> = {
  "pepper-and-carrot": { work: "Pepper&Carrot", author: "David Revoy", license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/", source: "peppercarrot.com", sourceUrl: "https://www.peppercarrot.com" },
  "mini-fantasy-theater": { work: "Mini Fantasy Theater", author: "David Revoy", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", source: "peppercarrot.com", sourceUrl: "https://www.peppercarrot.com/en/miniFantasyTheater/" },
  "give-my-regards-to-black-jack": { work: "Give My Regards to Black Jack", author: "SHUHO SATO", license: "free secondary use terms of Sato Manga Works", licenseUrl: "https://densho810.com/free/", source: "densho810.com", sourceUrl: "https://densho810.com/free/", note: "Official English edition data." },
};

export const creditFor = (slug: string | undefined) => (slug ? CREDITS[slug] : undefined);
