"use client"

import { Navbar } from "@/components"

type Hobbies = {
    icon: string, 
    label: string, 
    sub: string,
    link?: string
}
type Stack = {
    name: string, 
    level: number
}

type Timeline = {
    year: string 
    title: string 
    desc: string 
}

export default function About() {

    const timeline : Timeline[] = [
        {
            year: "2025", 
            title: "Building Portfolio Apps",
            desc: "This year I got my first internship which allowed me to help contribute to a start up and their MVP. I would help create their web pages and style them appropriate to the companies aesthetics."
        },
        {
            year: "2024", 
            title: "Learning and Growing",
            desc: "During this year I have continued working on websites including my mothers business website and a few freelance projects. I tried exploring different frameworks and languages such as Svelte.JS and Next.JS. I also got my certificates from Codecademy for Frontend Development and Full Stack Development."
        },
        {
            year: "2023", 
            title: "Graduated and Pursuing Software Development",
            desc: "I graduated from UC Davis with a B.S. in Genetics but have been aggressively pursuing software development as a career. I build a wide variety of websites and applications that are focused on pushing my UI and UX knowledge. "
        }, 
        {
            year: "2022", 
            title: "Learning about Blockchain and Golang",
            desc: "Throughout this year I programmed in learned different programming languages such as Solidity and Golang. I was briefly interested in blockchain development as I created a few smart contracts using Solidity. I learned Golang to be able to contribute to AggieWorks and their Clubly.org website. I briefly used it to create some routes and database queries but haven't had the chance to try it since then."
        }, 
        {
            year: "2021", 
            title: "Learning New Languages and Frameworks",
            desc: "Throughout this year I explored ReactJS, NodeJS, ExpressJS, and other frameworks that helped create a full stack application. I learned to create different websites using these frameworks and created projects with different backgrounds and aesthetics. I also started learning about UI and UX design patterns that helped me create more intuitive and aesthetically pleasing websites."
        }, 
        {
            year: "2020", 
            title: "Journey Starts",
            desc: "I had plenty of free time to pursue my hobby of creating websites that are aesthtically intuitive for UI and UX. By starting out at Codecademy.com and Youtube tutorials, I eventually created full stack applications that would require different frameworks."
        }, 

    ]

    const stack :Stack[]  = [
        {name: "Javascript", level: 5},
        {name: "React", level: 5},
        {name: "Node.js", level: 5},
        {name: "CSS / Animations", level: 3},
        {name: "Rest API's", level: 5},
        {name: "Git / Github", level: 3},
    ]

    const hobbies : Hobbies[] =[
        {icon: "🎮", label: "Gaming", sub: "Nostalgic & Pirating" }, 
        {icon: "📚", label: "Reading", sub: "Tech Blogs & Sci-Fi", link: "http://localhost:3000/blog"}, 
        {icon: "🎵", label: "Music", sub: "Phonk and House Music", link: "https://open.spotify.com/user/alejandrovilanova?si=b69b95de5ba44da3"}, 
        {icon: "🏃", label: "Running", sub: "Afternoon Runs", link: "https://strava.app.link/Cs3Xt6qMb2b"}, 
    ]

    const values: string[] = ["Clean Code", "Interactive UI", "Always Learning", "Expanding Horizons"]
    return (
        <div className="min-h-screen font-dm p-6 md:p-8 bg-[#0a0a0f]">
            <Navbar currentLink="About" />

            {/* bento grid again */}

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-4">

                <div className="col-span-1 md:col-span-1 xl:col-span-7 bg-[#13121c] border border-[#2a2840] min-h-[260px] rounded-2xl flex flex-col justify-between hover:-translate-y-1 p-6 transition-transform duration-300">
                   <div>
                   <p className="text-[11px] tracking-widest uppercase text-[#7c6dff] font-medium mb-2">About Me</p>
                    <h1 className="font-syne font-extrabold text-2xl text-[#f0eeff] tracking-tight leading-tight mb-4 ">
                        Developer with a <br /> engineering&apos;s eye.
                    </h1>
                    <p className="text-sm text-[#7a7890] leading-relaxed mb-3">
                        I am a full stack developer that enjoys creating aesthetically pleasing websites. 
                        I started making websites back in 2020 and have since then learned and built many applications using different programming languages. 

                    </p>
                    <p className="text-sm text-[#7a7890] leading-relaxed mb-5">
                        I believe that software should look good as well as be easy to use. The better interface and user experience, the faster a user will come back to use the application.
                    </p>
                   </div>
                <div className="flex flex-wrap gap-2">
                    {
                        values.map((value) => (
                            <span key={value} className="text-xs px-3 py-1.5 rounded-full border border-[#2a2840] text-[#c4c0d8] font-medium">
                                {value}
                            </span>
                        ))
                    }
                </div>
                </div>

            {/* Avatar card spans 5 / 12 slots */}
            <div className="col-span-1 md:col-span-1 xl:col-span-5 bg-[#7c6dff] rounded-2xl p-6 flex flex-col items-center justify-center text-center min-h-[260px] hover:-translate-y-1 transition-transform duration-300 ">
                <div className="w-24 h-24 rounded-full bg-white/15 flex items-center justify-center font-syne font-extrabold text-3xl text-white mb-4">
                    {/* Circle Initials */}
                    JAVA
                </div>
            
                    <p className="font-syne font-extrabold text-xl text-white mb-1">Jorge Alejandro Vilanova Alvarado</p>
                    <p className="text-sm font-white/65 mb-3">Full Stack Developer</p>
                    <div className="flex items-center gap-2 text-xs text-white/50">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse"/>
                        California, USA · Open To Remote
                    </div>

            </div>


            {/* Timeline card 8 / 12 slots */}
            <div className="col-span-1 md:col-span-1 xl:col-span-8 bg-[#13121c] border border-[#2a2840] rounded-2xl p-6 hover:-translate-y-1 transition-transform duration-300 ">
                <p className="text-[11px] tracking-widest uppercase text-[#555370] font-medium mb-5"> 
                    Journey
                </p>

                <div className="flex flex-col gap-0 ">
                    {
                        timeline.map((item, i) => (
                            <div className="flex gap-4" key={item.year}>
                                <div className="flex flex-col items-center min-h-[40px]">
                                        <p className="text-[11px] text-[#7c6dff] font-medium mb-1 whitespace-nowrap">{item.year}</p>
                                        <div className="w-2 h-2 rounded-full bg-[#7c6dff] flex-shrink-0" />
                                        {
                                            i < timeline.length - 1 && (
                                                <div className="w-px flex-1 bg-[#2a2840] my-1" />
                                            )
                                        }
                                    </div>

                                    <div className={`pb-5 ${i === timeline.length - 1 ? "pb-0": ""}`}> 
                                        <p className="text-sm font-medium text-[#e8e6f0] mb-1 " >{item.title}</p>
                                        <p className="text-xs text-[#6b6880] leading-relaxed  ">{item.desc}</p>

                                    </div>

                                </div>
                        ))
                    }

                </div>

            </div>

            <div className="col-span-1 md:col-span-1 xl:col-span-4 bg-[#0f1a14] border border-[#1a2e20] rounded-2xl p-6 hover:-translate-y-1 transition-transform duration-300">
                <p>
                    Tech Language
                    </p>         

                <div className="flex flex-col">
                     {
                        stack.map((s, i) => (
                            <div key={s.name} className={`flex items-center justify-between py-2.5 ${i < stack.length - 1 ? "border-b border-[#1a2e20]" : ""}`}>
                                <span className="text-sm text-[#c4c0d8] font-medium">{s.name}</span>
                                <div className="flex gap-1">
                                    {
                                        Array.from({length: 5}).map((_,j) => (
                                            <div className={`w-2 h-2 rounded-full ${j < s.level ? "bg-[#4a9e6a]" : "bg-[#1a2e20]"}`} key={j} />
                                        ))
                                    }
                                            
                                    </div>

                            </div>
                        ))
                     }
                    </div>           


            </div>



                     {/* Hobbies 12/12 slots */}
            <div className="col-span-1 md:col-span-1 xl:col-span-12 bg-[#16131a] border border-[#2a2840] rounded-2xl p-6 hover:-translate-y-1 transition-transform duration-300 ">
                <p className="text-[11px] tracking-widest uppercase text-[#555370] font-medium mb-4">
                     When I&apos;m not coding
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {
                        hobbies.map((hobby) => (
                            <a key={hobby.label} target="_blank" href={hobby.link ? hobby.link : "#"} className="bg-[#13121c] cursor-pointer border border-[#2a2840] rounded-xl p-4 text-center hover:-translate-y-1 transition-transform duration-300 ">
                                <div className="text-xl mb-2">{hobby.icon}</div>
                                <p className="text-xs text-[#c4c0d8] font-medium mb-1">{hobby.label}</p>
                                <p className="text-[11px] text-[#555370]">{hobby.sub}</p>
                            </a>
                        ))
                    }

                </div>

            </div>



            </div>
        </div>
    )

}