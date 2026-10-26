// Alt CV-indhold bor her — siden (src/routes/cv.tsx) læser bare disse
// lister og tegner dem op. Alt herunder er et eksempel på en opdigtet person;
// erstat det med dit eget. For at opdatere CV'et:
//
//   - Nyt job: tilføj et objekt øverst i `experience` (nyeste job først).
//   - Ændre noget: ret direkte i det objekt herunder.
//   - Fjerne noget: slet objektet (eller kommentér det ud).
//
// Ingen andre filer skal røres for at holde CV'et opdateret (preview-billedet
// til delinger ligger i public/cv-og.jpg).

export const profile = {
  name: "Alex Jensen",
  location: "København, Danmark",
  tagline:
    "Eventkoordinator med erfaring fra koncerter, fester og konferencer. Skal vi hjælpe med jeres næste event?",
  email: "alex@example.com",
  phone: "12345678",
  linkedin: "https://www.linkedin.com/in/example",
};

export const skills: string[] = ["Eventplanlægning", "Indkøb", "Teamledelse"];

export const languages: { name: string; level: string }[] = [
  { name: "Engelsk", level: "Professionelt arbejdsniveau" },
];

export type CvEducation = {
  school: string;
  degree: string;
  period: string;
};

export const education: CvEducation[] = [
  {
    school: "Eksempel Gymnasium",
    degree: "Studentereksamen, samfundsfag og økonomi",
    period: "2015 – 2018",
  },
];

export type CvExperience = {
  title: string;
  company: string;
  employmentType?: string;
  period: string;
  location?: string;
  description?: string;
};

export const experience: CvExperience[] = [
  {
    title: "Eventkoordinator",
    company: "Nordlys Events",
    employmentType: "Fuldtid",
    period: "mar. 2022 – nu",
    location: "København · Hybridarbejde",
    description:
      "Planlægger og afvikler koncerter, firmafester og konferencer fra første møde med kunden til oprydningen bagefter.",
  },
  {
    title: "Vagtleder",
    company: "Café Havnen",
    employmentType: "Deltid",
    period: "aug. 2019 – feb. 2022",
    location: "København",
    description: "Ansvarlig for vagtplaner, indkøb og et team på otte medarbejdere.",
  },
  {
    title: "Frivillig arrangør",
    company: "Byens Bibliotek",
    period: "sep. 2018 – jun. 2019",
    location: "København",
  },
];
