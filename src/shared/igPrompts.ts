// Ready requests for the Instagram helpers (the ig-* skills). Shown as buttons above the Ask box on the
// editor page and as a menu in Claude Desktop (connector prompts), so she never has to remember them.
// `text` ends where she types her topic; `topic: false` = complete as it is.
export type IgPrompt = {
  id: string;
  skill: string;
  label: { en: string; pl: string };
  text: { en: string; pl: string };
  topic: boolean;
};

export const IG_PROMPTS: IgPrompt[] = [
  { id: 'hooks', skill: 'ig-reel', topic: true,
    label: { en: 'Hooks', pl: 'Hooki' },
    text: { en: 'Give me 3 hooks for a reel about ', pl: 'Daj mi 3 hooki do rolki o ' } },
  { id: 'script', skill: 'ig-reel', topic: true,
    label: { en: 'Reel script', pl: 'Scenariusz rolki' },
    text: { en: 'Write a 30-second reel script about ', pl: 'Napisz scenariusz 30-sekundowej rolki o ' } },
  { id: 'week', skill: 'ig-plan', topic: true,
    label: { en: 'Plan my week', pl: 'Plan tygodnia' },
    text: { en: 'Plan my Instagram week. Topics I want: ', pl: 'Zaplanuj mój tydzień na Instagramie. Tematy: ' } },
  { id: 'trends', skill: 'ig-viral', topic: true,
    label: { en: 'What works now', pl: 'Co teraz działa' },
    text: { en: 'What works in my niche right now? Reels or accounts I like: ', pl: 'Co teraz działa w mojej niszy? Rolki lub konta, które lubię: ' } },
  { id: 'caption', skill: 'ig-caption', topic: true,
    label: { en: 'Check a caption', pl: 'Sprawdź opis' },
    text: { en: 'Check this caption and make it better: ', pl: 'Sprawdź i popraw ten opis: ' } },
  { id: 'replies', skill: 'ig-reply', topic: true,
    label: { en: 'Reply to comments', pl: 'Odpowiedzi na komentarze' },
    text: { en: 'Help me reply to these comments: ', pl: 'Pomóż mi odpowiedzieć na te komentarze: ' } },
  { id: 'dm', skill: 'ig-dm', topic: false,
    label: { en: 'Keyword DM', pl: 'DM ze słowem-kluczem' },
    text: { en: 'Write the DM I send when someone comments the keyword of this reel.', pl: 'Napisz wiadomość, którą wysyłam, gdy ktoś skomentuje słowo-klucz z tej rolki.' } },
  { id: 'carousel', skill: 'ig-carousel', topic: true,
    label: { en: 'Carousel', pl: 'Karuzela' },
    text: { en: 'Make a carousel post about ', pl: 'Zrób karuzelę o ' } },
  { id: 'stories', skill: 'ig-story', topic: true,
    label: { en: 'Stories', pl: 'Relacje' },
    text: { en: 'Plan my stories for today about ', pl: 'Zaplanuj moje dzisiejsze relacje o ' } },
  { id: 'repurpose', skill: 'ig-repurpose', topic: false,
    label: { en: 'Video into a week', pl: 'Film na cały tydzień' },
    text: { en: 'Turn this video into a week of posts.', pl: 'Zrób z tego filmu posty na cały tydzień.' } },
  { id: 'profile', skill: 'ig-profile', topic: true,
    label: { en: 'Check my profile', pl: 'Sprawdź mój profil' },
    text: { en: 'Check my Instagram profile and tell me what to fix. My bio: ', pl: 'Sprawdź mój profil na Instagramie i powiedz, co poprawić. Moje bio: ' } },
  { id: 'audit', skill: 'ig-audit', topic: true,
    label: { en: 'What worked', pl: 'Co zadziałało' },
    text: { en: 'Look at my last posts and tell me what worked. Views, saves and shares: ', pl: 'Sprawdź moje ostatnie posty i powiedz, co zadziałało. Wyświetlenia, zapisy i udostępnienia: ' } },
  { id: 'voice', skill: 'ig-reel', topic: false,
    label: { en: 'Set up my voice', pl: 'Ustaw mój styl' },
    text: { en: 'Set up my voice file with me (instagram/voice.md). Ask me the questions one by one.', pl: 'Uzupełnij ze mną mój plik głosu (instagram/voice.md). Zadawaj mi pytania po jednym.' } },
];
