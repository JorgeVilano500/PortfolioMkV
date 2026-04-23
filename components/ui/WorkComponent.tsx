"use client"
import { useState } from "react"
import { projects } from "@/lib/projects"

export function WorkComponent() {

    const [activeFilter, setActiveFilter] = useState<string>("All")

    const filters : string[] = ["All", "Games", "API's", "UI/UX", "Full Stack"]

    const filtered = projects.filter((p) => 
            activeFilter === "All" ? true : p.filters.includes(activeFilter)
        )

    const featured = filtered.find((p) => p.featured) ?? null;
    const nonFeat = filtered.filter((p) => !p.featured) ?? null;
    const sideCard = featured ? nonFeat[0] ?? null : null;
    const smallCards = featured ? nonFeat.slice(1) : nonFeat; 



    return (
        <div className="mb-8">

            {/* header */}
            <section className="col-span-1 md:col-span-1 xl:col-span-7 rounded-2xl p-6 flex flex-col justify-end min-h-[200] ">
                <p className="text-[11px] tracking-widest uppercase text-[#7c6dff] font-medium mb-2">Portfolio</p>
                <h1 className="font-syne font-extrabold text-3xl md:text-4xl text-[#f0eeff] tracking-tight mb-2">Things I've built</h1>
                <p className="text-sm text-gray-500 max-w-sm leading-relaxed">Interactive apps, full stack projects, and UI experiments</p>
            </section>

            {/* need to make filter still  */}

            <div className="flex flex-wrap gap-2 mb-8">
                {
                    filters.map((f) => (
                        <button
                            key={f}
                            onClick={() => setActiveFilter(f)}
                            className={`text-xs px-4 py-2 rounded-full border transition-all duration-200 cursor-pointer font-dm ${activeFilter === f ? "bg-[#7c6dff] text-white border-[#7c6dff]" : "border-[#2a2840] text-[#888] hover:border-[#7c6dff] hover:text-[#c4c0d8]"}`}
                        >
                            {f}
                        </button>
                    ))
                }

            </div>


            {/* Big project displayed */}
            {/* Bento grid first */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-4">
                {
                    featured && (
                        <div className={`col-span-1 md:col-span-2 xl:col-span-8 min-h-[240px] ${featured.cardBg} rounded-2xl p-6 relative overflow-hidden hover:-translate-y-1 transition-transform duration-300 cursor-pointer`}>
                            <div className="absolute   rounded-full pointer-events-none " style={{
                                background: "radial-gradient(circle, rgba(120,100,255,.15) 0%, transparent 70%)"
                            }} />
                                <div className="flex flex-col justify-between  ">
                                    <div>
                                        <div className={`${featured.iconBg} mt-16 w-full  w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mb-4`}>
                                            {featured.icon}
                                        </div>
                                        <p className={`text-[10px] tracking-widest uppercase font-medium mb-2 ${featured.catColor}`}>
                                            {featured.cat}
                                        </p>
                                        <h2 className="font-syne font-extrabold text-2xl text-[#f0eeff] tracking-light leading-tight mb-3 ">
                                            {featured.title}
                                        </h2>
                                        <p className="text-sm text-[#6b6880] leading-relaxed mb-4 max-w-md">
                                            {featured.desc}
                                        </p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {
                                                featured.tags.map((tag) => 
                                                    <span className={`text-xs px-2.5 py-0.5 rounded-full border font-medium ${featured.tagStyle}`}>
                                                        {tag}
                                                    </span>
                                                )
                                            }
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between mt-5">
                                            <div className="flex items-center gap-1.5">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                                <span className="text-xs text-emerald-400 font-medium">
                                                    Live
                                                </span>
                                            </div>
                                                <a target="_blank" href={featured.link ? featured.link : "#"} className="text-xs text-[#7c6dff] font-medium hover:underline "> 
                                                    View Project  →
                                               </a>

                                    </div>
                                </div>
                                </div>
                    )
                }

                {/* Side card on first row */}
                {
                    sideCard && (
                        <div className={`col-span-1 xl:col-span-4 ${sideCard.cardBg} p-6 rounded-2xl relative overflow-hidden hover:-translate-y-1 transition-transform duration-300 cursor-pointer`}>
                            <div className="flex flex-col justify-between min-h-[240px]  mt-16">
                                <div>
                                    <div className={`${sideCard.iconBg} h-14 rounded-2xl flex items-center justify-center text-2xl mb-4  w-full`}>
                                            {sideCard.icon}
                                        </div>
                                    <p className={`text-[10px] tracking-widest uppercase font-medium mb-2 ${sideCard.catColor}`}>
                                        {sideCard.cat}
                                    </p>
                                    <h3 className="font-syne font-bold text-xl text-[#f0eeff] tracking-light leading-snug mb-2">
                                        {sideCard.title}
                                    </h3>
                                    <p className="text-xs text-[#6b6880] leading-relaxed mb-3">
                                        {sideCard.desc}
                                    </p>
                                    <div className="flex flex-wrap gap-1.5">
                                            {
                                                sideCard.tags.map((tag) => (
                                                    <span className={`text-xs px-2.5 py-0.5 rounded-full border font-medium ${sideCard.tagStyle}`}>
                                                        {tag}
                                                    </span>
                                                ))
                                            }
                                        </div>
                                </div>
                                <div className="flex items-center justify-between mt-4">
                                        <div className="flex items-center gap-1.5">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                            <span className="text-xs text-emerald-400 font-medium">Live</span>
                                        </div>
                                        <a target="_blank" href={sideCard.link ? sideCard.link : "#"} className="text-xs text-[#7c6dff] font-medium hover:underline">
                                            View →
                                        </a>
                                    </div>
                            </div>
                            </div>
                    )
                }

                {/* Bottom Row */}
                {
                    smallCards.map((card, index) => (
                        <div className={`col-span-1 xl:col-span-4 ${card.cardBg} rounded-2xl relative overflow-hidden hover:-translate-y-1 transition-transform duration-300 cursor-pointer`} key={card.id} >
                            <div className="flex flex-col justify-between min-h-[200px] p-6">
                                <div>
                                    <div className={`${card.iconBg} w-full h-14 rounded-2xl flex items-center justify-center text-2xl mb-3`}> 
                                        {card.icon}
                                    </div>
                                    <p className={`text-[10px] tracking-widest uppercase font-medium mb-2 ${card.catColor}`}>
                                        {card.cat}
                                    </p>
                                    <h3 className="font-syne font-bold text-lg text-[#f0eeff] tracking-light leading-snug mb-2">
                                        {card.title}
                                    </h3>
                                    <p className="text-xs text-[#6b6880] leading-relaxed mb-3">
                                        {card.desc}
                                    </p>
                                    <div className="flex flex-wrap gap-1.5 ">
                                        {card.tags.map((tag) => (
                                            <span className={`text-xs px-2.5 py-0.5 rounded-full border font-medium ${card.tagStyle} `}>
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex items-center justify-between mt-4 ">
                                    <div className="flex items-center gap-1.5">
                                            {
                                                card.status === "live" && (
                                                    <>
                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                                        <span className="text-xs text-emerald-400 font-medium">Live</span>
                                                    </>
                                                )
                                            }
                                            {
                                                card.status === "wip" && (
                                                    <>
                                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 " />
                                                        <span className="text-xs text-amber-400 font-medium">In Progress</span>
                                                    </>
                                                )
                                            }
                                            {
                                                card.status === "planned" && (
                                                    <>
                                                        <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                                                        <span className="text-xs text-orange-400 font-medium">Planned</span>
                                                        </>
                                                )
                                            }
                                        </div>
                                        <a target="_blank" href={card.link ? card.link : "#"} className={`text-xs font-medium hover:underline ${card.catColor}`}>
                                            View →
                                        </a>

                                </div>

                            </div>

                            </div>
                    ))
                }



            </div>
        </div>
    )
}