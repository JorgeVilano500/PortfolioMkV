
import resume from '../../public/assets/resume.pdf'

type Skills = {
    name: string
    pct: number
}

type Project = { 
    icon: string 
    label: string
    muted?: boolean
    link?: string
}

type Stats = {
    label: string 
    value: string 
    sub: string 
}

type GetInTouch = {
    link: string
    platform: string 
}

export function HomeComponent() {

    const skills: Skills[] = [
        {name: "Typescript", pct: 90},
        {name: "TailwindCSS", pct: 80},
        {name: "Solidity", pct: 70},
        {name: "Golang", pct: 50},
    ]
    const projects: Project[] =[
        { icon: "🎱", label: "8-Ball", link: "https://fatesball.netlify.app/" },
        { icon: "🎡", label: "Spinner", link: "https://spin-choice.netlify.app/" },
        { icon: "🎲", label: "Dice", link: "https://dice-shaker.netlify.app/" },
        { icon: "💻", label: "Old Porfolio", link: "https://javawebsite.netlify.app/" },
        { icon: "🚀", label: "List of Projects", link: "https://productmt.netlify.app/" },
        { icon: "+",  label: "More",  muted: true },
      ]

      const stats: Stats[] = [
        {label: "Projects Built", value: "6+", sub: "Interactive apps shipped"},
        {label: "Experience", value: "4yr", sub: "Full Stack Development"},
        {label: "Technologies", value: "14+", sub: "Tools, Languages, Frameworks used"}
      ]

     const contact: GetInTouch[]  = [
        {link: "https://github.com/JorgeVilano500", platform: "Github"},
        {link: "https://www.linkedin.com/in/jorge-vilanova-983750100/", platform: "LinkedIn"},
        {link: "", platform: "Instagram"},
        {link: "", platform: "Crypto"}
     ]


    return (
        <main className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-4">
            {/* first stack */}
        <div className="col-span-1 md:col-span-1 xl:col-span-7 bg-[#13121c] border border-[#2a2840] rounded-2xl p-6 flex flex-col justify-end min-h-[200px] hover:-translate-y-1 transition-transform duration-300">
          <p className="text tracking-widest uppercase text-violet-400 mb-2">
            Full Stack Developer
          </p>
          <h1 className="font-extrabold text-4xl text-white leading-tight tracking-tight mb-3">
            Building things <br />people together 
          </h1>
          <p className="text-sm text-gray-500 max-w-sm leading-relaxed">
            Interactive apps, clean code, and interfaces worth remembering
          </p>
        </div>

        {/* Second stack */}
        <div className="col-span-1 md:col-span-1 xl:col-span-5 bg-violet-600 rounded-2xl p-6 flex flex-col justify-between min-h-[200px] hover:-translate-y-1 transition-transform duration-300 ">
            <div >
                <div className="flex items-center gap-2 mb-3">
                    <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse" />
                    <span className="text-xs text-white/60">Open to opportunities</span>
                </div>
                <p className="text-xs tracking-widest uppercase text-white/50 mb-1">
                    Currently focused on
                </p>
                <h2 className="font-extrabold text-2xl text-white leading-snug">
                    Frontend +<br/> API Integration
                </h2>
                <p className="text-sm text-white/60 mt-1">React · Node · REST APIs</p>
            </div>
            <a download="resume.pdf" href='/resume.pdf' className="bg-white text-violet-600 w-[50%] md:w-[35%] my-4 text-sm font-medium px-5 py-2.5 rounded-full w-filt hover:opacity-90 transition-opacity">
                View Resume →
            </a>
        </div>

        {/* Skills  */}
        <div className="col-span-1 md:col-span-1 xl:col-span-4 bg-[#13121c] border border-[#2a2840] rounded-2xl p-6 hover:-translate-y-1 transition-transform duration-300">
            <p className="text-xs tracking-widest uppercase text-gray-600 mb-5">Skills</p>
            {
                skills.map(({name, pct}) => (
                    <div key={name} className="mb-4">
                        <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-300">{name}</span>
                            <span className="text-violet-400 font-medium">{pct}%</span>
                            </div>
                        <div className="bg-[#1e1c2e] h-1 rounded-full overflow-hidden ">
                            <div className="h-full bg-violet-500 rounded-full" style={{width: `${pct}%`}} />
                            </div>
                        </div>
                ))
            }

        </div>
        {/* Projects */}
        <div className="col-span-1 md:col-span-1 xl:col-span-5 bg-[#0f1a14] border border-[#1a2e20] rounded-2xl p-6 hover:-translate-y-1 transition-transform duration-300 ">
            <p>Projects</p>
            <div className="grid grid-cols-3 gap-3">
                    {projects.map(({icon, label, muted, link}) => (
                        <a target="_blank" href={link} key={label} className={`aspect-square rounded-xl flex flex-col items-center justify-center gap-1.5 border border-[#1e3024]
                            bg-[#121f17] hover:bg-[#1a2e1f] hover:scale-105 transition-all duration-200 cursor-pointer ${muted ? "opacity-50 border-dashed": ""}`}>
                                <span className="text-xl">{icon}</span>
                                <span className="text-[10px] text-emerald-600 font-medium">{label}</span>

                        </a>
                ))}
            </div>
        </div>

            {/* Status */}
        {
            stats.map(({label, value, sub}) => (
                <div className="col-span-1 xl:col-span-3 bg-[#13121c] border border-[#2a2840] rounded-2xl p-6 flex flex-col justify-between min-h-[130px] hover:-translate-y-1 transition-transform duration-300">
                    <p className="text-2xl tracking-widest uppercase text-gray-600">{label}</p>
                    <p className="text-5xl text-white font-extrabold tracking-tight">{value}</p>
                    <p className="text-2xl text-gray-600">{sub}</p>
                </div>
            ))
        }

        {/* Contact card */}

        <div className="col-span-1 md:col-span-1 lg:col-span-4 bg-[#1a1216] border border-[#2e1f28] rounded-2xl p-6 flex flex-col justify-between min-h-[130px] hover:-translate-y-1 transition-transform duration-300">
            <p className="text-xs tracking-widest uppercase text-gray-600">Get In Touch</p>
            <p className="text-base font-bold text-pink-200 break-all">vilanova.jorge50@gmail.com</p>
            <div className="flex gap-2 flex-wrap">
                {
                    contact.map(({link, platform}) => (
                        <a key={platform} href={link} target="_blank" className="border-[#3e2535]
                           text-pink-200 font-medium hover:bg-[#2e1f28] text-xs px-3 py-1.5 border transition-colors cursor-pointer">
                            {platform}
                            </a>
                    ))
                }
            </div>
        </div>
        
            
        {/* Quote */}
        <div className="col-span-1 md:col-span-1 lg:col-span-5 bg-[#16131a] border border-[#2a2840] rounded-2xl p-6 flex flex-col justify-center min-h-[130px] hover:-translate-y-1 transition-transform duration-300">
            <p className="font-bold text-lg text-gray-300 leading-relaxed tracking-tight">
                "Don't stop trying to prove something"
            </p>
            <p className="text-xs text-gray-600 mt-3">
                -- Quote I like to say
            </p>
        </div>
        
      </main>
    )
}