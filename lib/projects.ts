export type ProjectStatus = "live" | "wip" | "planned"

export type Project = {
    id: number
    icon: string
    title: string
    desc: string
    cat: string
    catColor: string
    iconBg: string
    cardBg: string
    tags: string[]
    tagStyle: string
    status: ProjectStatus
    filters: string[]
    featured: boolean
    year?: string
    link?: string
    github?: string
}

export const projects: Project[] = [
    {
        id: 1,
        icon: "🎲",
        cat: "Featured project",
        catColor: "text-[#AFA9EC]",
        iconBg: "bg-[#1e1c2e]",
        cardBg: "bg-[#13121c] border border-[#2a2840]",
        title: "Interactive Dice Roller",
        desc: "3D animated dice with customizable sides, roll history, and sound effects. Built with vanilla JS and CSS transforms.",
        tags: ["JavaScript", "CSS Animations", "LocalStorage"],
        tagStyle: "border-[#534AB7] text-[#AFA9EC] bg-[#13111e]",
        status: "live",
        filters: ["Games", "UI/UX"],
        featured: true,
        year: "2023",
        link: "https://dice-shaker.netlify.app/",
    },
    {
        id: 2,
        icon: "🎡",
        cat: "Game",
        catColor: "text-[#97C459]",
        iconBg: "bg-[#121f17]",
        cardBg: "bg-[#13121c] border border-[#2a2840]",
        title: "Spin the Wheel",
        desc: "Custom prize wheel with editable segments, spin physics, and confetti on win.",
        tags: ["Canvas API", "React"],
        tagStyle: "border-[#3B6D11] text-[#97C459] bg-[#0f1a0a]",
        status: "live",
        filters: ["Games", "UI/UX"],
        featured: false,
        year: "2023",
        link: "https://spin-choice.netlify.app/",
    },
    {
        id: 3,
        icon: "🎱",
        cat: "Game",
        catColor: "text-[#97C459]",
        iconBg: "bg-[#121f17]",
        cardBg: "bg-[#0f1a14] border border-[#1a2e20]",
        title: "Magic 8-Ball",
        desc: "Shake to reveal. Animated reveal with 20 classic responses.",
        tags: ["HTML/CSS", "JavaScript"],
        tagStyle: "border-[#3B6D11] text-[#97C459] bg-[#0f1a0a]",
        status: "live",
        filters: ["Games", "UI/UX"],
        featured: false,
        year: "2022",
        link: "https://fatesball.netlify.app/",
    },
    {
        id: 4,
        icon: "💻",
        cat: "Portfolio",
        catColor: "text-[#AFA9EC]",
        iconBg: "bg-[#1e1c2e]",
        cardBg: "bg-[#13121c] border border-[#2a2840]",
        title: "Old Portfolio",
        desc: "First personal portfolio site. Static HTML/CSS with a Java-inspired aesthetic.",
        tags: ["HTML", "CSS", "JavaScript"],
        tagStyle: "border-[#534AB7] text-[#AFA9EC] bg-[#13111e]",
        status: "live",
        filters: ["UI/UX"],
        featured: false,
        year: "2021",
        link: "https://javawebsite.netlify.app/",
    },
    {
        id: 5,
        icon: "🚀",
        cat: "Directory",
        catColor: "text-[#AFA9EC]",
        iconBg: "bg-[#1e1c2e]",
        cardBg: "bg-[#13121c] border border-[#2a2840]",
        title: "Project Directory",
        desc: "A living list of all apps and experiments I have shipped.",
        tags: ["React"],
        tagStyle: "border-[#534AB7] text-[#AFA9EC] bg-[#13111e]",
        status: "live",
        filters: ["UI/UX"],
        featured: false,
        year: "2024",
        link: "https://productmt.netlify.app/",
    },
    {
        id: 6,
        icon: "🌤",
        cat: "API",
        catColor: "text-[#AFA9EC]",
        iconBg: "bg-[#1e1c2e]",
        cardBg: "bg-[#13121c] border border-[#2a2840]",
        title: "Weather Dashboard",
        desc: "Live weather data, 5-day forecast, and location search powered by OpenWeather.",
        tags: ["REST API", "React"],
        tagStyle: "border-[#534AB7] text-[#AFA9EC] bg-[#13111e]",
        status: "wip",
        filters: ["API's", "Full Stack"],
        featured: false,
        year: "2025",
    },
    {
        id: 7,
        icon: "🧠",
        cat: "Coming soon",
        catColor: "text-[#ED93B1]",
        iconBg: "bg-[#1a0f14]",
        cardBg: "bg-[#1a1216] border border-[#2e1f28]",
        title: "Trivia Quiz App",
        desc: "Live questions from Open Trivia DB, timed rounds, and a live leaderboard.",
        tags: ["Node.js", "REST API"],
        tagStyle: "border-[#993556] text-[#ED93B1] bg-[#1a0f14]",
        status: "planned",
        filters: ["API's", "Full Stack"],
        featured: false,
        year: "2025",
    },
]
