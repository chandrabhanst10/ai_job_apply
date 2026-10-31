const KNOWN = [
  "JavaScript", "TypeScript", "Node.js", "React", "React Native", "Next.js", "Redux", "Vue", "Angular", "HTML", "CSS", "Tailwind",
  "Express", "NestJS", "GraphQL", "REST", "Python", "Django", "Flask", "FastAPI", "Java", "Spring Boot", "Kotlin", "Swift", "Go",
  "Rust", "C++", "C#", ".NET", "PHP", "Laravel", "Ruby", "Rails", "SQL", "MySQL", "PostgreSQL", "MongoDB", "Redis", "Elasticsearch",
  "Kafka", "RabbitMQ", "AWS", "Azure", "GCP", "Docker", "Kubernetes", "Terraform", "Jenkins", "CI/CD", "Git", "Linux", "Android",
  "iOS", "Flutter", "Firebase", "Jest", "Cypress", "Selenium", "Playwright", "Microservices", "Machine Learning", "Pandas", "NumPy",
  "TensorFlow", "PyTorch", "Spark", "Agile", "Scrum",
];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Known tech keywords present in free text (whole-token match). */
export function extractSkills(text: string): string[] {
  return KNOWN.filter((k) => new RegExp(`(?<![A-Za-z0-9+#.])${esc(k)}(?![A-Za-z0-9+#])`, "i").test(text));
}
