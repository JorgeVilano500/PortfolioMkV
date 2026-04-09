"use client"

import { Navbar } from "@/components"
import Link from "next/link"

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
            desc: ""
        },
        {
            year: "2024", 
            title: "Building Portfolio Apps",
            desc: ""
        },
        {
            year: "2023", 
            title: "Building Portfolio Apps",
            desc: ""
        }, 
        {
            year: "2022", 
            title: "Building Portfolio Apps",
            desc: ""
        }, 
        {
            year: "2021", 
            title: "Learning ",
            desc: ""
        }, 
        {
            year: "2020", 
            title: "Journey Starts",
            desc: "Being locked up during COVID gave me free time to pursue my hobby of creating websites that are pleasing for UI and UX."
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
                        I started with designs for wheel spinners and dice rollers and have since then advanced to different projects. 

                    </p>
                    <p className="text-sm text-[#7a7890] leading-relaxed mb-5">
                        I believe that software should look good as well as it performs. 
                    </p>
                   </div>
                <div className="flex flex-wrap gap-2">
                    {
                        values.map((value) => (
                            <span className="text-xs px-3 py-1.5 rounded-full border border-[#2a2840] text-[#c4c0d8] font-medium">
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
                        hobbies.map((hobby, i) => (
                            <a target="_blank" href={hobby.link ? hobby.link : "#"} className="bg-[#13121c] cursor-pointer border border-[#2a2840] rounded-xl p-4 text-center hover:-translate-y-1 transition-transform duration-300 ">
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