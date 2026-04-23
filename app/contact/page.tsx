"use client"
import { useState } from "react"
import { Navbar } from "@/components"
import { FaGithub, FaLinkedin, FaInstagram, FaTwitch } from "react-icons/fa6"
import { MdEmail, MdContentCopy, MdCheck } from "react-icons/md"
import { IoLocationSharp } from "react-icons/io5"

const EMAIL = "vilanova.jorge50@gmail.com"

type Social = {
    icon: React.ReactNode
    platform: string
    handle: string
    link: string
    bg: string
    border: string
    iconColor: string
}

export default function Contact() {
    const [copied, setCopied] = useState(false)

    const socials: Social[] = [
        {
            icon: <FaGithub size={20} />,
            platform: "GitHub",
            handle: "@JorgeVilano500",
            link: "https://github.com/JorgeVilano500",
            bg: "bg-[#13121c]",
            border: "border-[#2a2840]",
            iconColor: "text-gray-300",
        },
        {
            icon: <FaLinkedin size={20} />,
            platform: "LinkedIn",
            handle: "jorge-vilanova",
            link: "https://www.linkedin.com/in/jorge-vilanova-983750100/",
            bg: "bg-[#0d1929]",
            border: "border-[#1a3050]",
            iconColor: "text-blue-400",
        },
        {
            icon: <FaInstagram size={20} />,
            platform: "Instagram",
            handle: "@java.dev_",
            link: "#",
            bg: "bg-[#1a1216]",
            border: "border-[#3e2535]",
            iconColor: "text-pink-400",
        },
        {
            icon: <FaTwitch size={20} />,
            platform: "Twitch",
            handle: "@java_studios",
            link: "https://www.twitch.tv/java_studios",
            bg: "bg-[#0f0f14]",
            border: "border-[#222230]",
            iconColor: "text-gray-400",
        },
    ]

    const copyEmail = () => {
        navigator.clipboard.writeText(EMAIL)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const handleSubmit = (formData: FormData) => {
        const name = formData.get("name") as string
        const message = formData.get("message") as string
        if (!name || !message) return
        window.location.href = `mailto:${EMAIL}?subject=Hello from ${encodeURIComponent(name)}&body=${encodeURIComponent(message)}`
    }

    return (
        <div className="min-h-screen font-dm p-6 md:p-8 bg-[#0a0a0f]">
            <Navbar currentLink="Contact" />

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-4">

                {/* Hero */}
                <div className="col-span-1 md:col-span-1 xl:col-span-7 bg-pink-600 rounded-2xl p-6 flex flex-col justify-between min-h-[220px] hover:-translate-y-1 transition-transform duration-300">
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse" />
                        <span className="text-xs text-white/60">Available for new projects</span>
                    </div>
                    <div>
                        <p className="text-xs tracking-widest uppercase text-white/50 mb-2">Say Hello</p>
                        <h1 className="font-extrabold text-4xl text-white leading-tight tracking-tight mb-3">
                            Let&apos;s build<br />something together
                        </h1>
                        <p className="text-sm text-white/60 max-w-sm leading-relaxed">
                            Whether it&apos;s a new project, a collab, or just want to chat — my inbox is always open.
                        </p>
                    </div>
                </div>

                {/* Email card */}
                <div className="col-span-1 md:col-span-1 xl:col-span-5 bg-[#1a1216] border border-[#2e1f28] rounded-2xl p-6 flex flex-col justify-between min-h-[220px] hover:-translate-y-1 transition-transform duration-300">
                    <div className="flex items-center gap-2">
                        <MdEmail size={14} className="text-pink-400" />
                        <p className="text-xs tracking-widest uppercase text-gray-600">Direct Email</p>
                    </div>
                    <div>
                        <p className="text-base font-bold text-pink-200 break-all mb-4">{EMAIL}</p>
                        <button
                            onClick={copyEmail}
                            className="flex items-center gap-2 bg-[#2e1f28] hover:bg-[#3e2535] text-pink-200 text-sm px-4 py-2.5 rounded-full border border-[#3e2535] transition-all duration-200 cursor-pointer"
                        >
                            {copied ? <MdCheck size={14} /> : <MdContentCopy size={14} />}
                            {copied ? "Copied!" : "Copy Email"}
                        </button>
                    </div>
                    <p className="text-xs text-gray-700">Typically responds within 24 hours</p>
                </div>

                {/* Social grid */}
                <div className="col-span-1 md:col-span-1 xl:col-span-4 bg-[#13121c] border border-[#2a2840] rounded-2xl p-6 hover:-translate-y-1 transition-transform duration-300">
                    <p className="text-xs tracking-widest uppercase text-gray-600 mb-4">Find Me On</p>
                    <div className="grid grid-cols-2 gap-3">
                        {socials.map(({ icon, platform, handle, link, bg, border, iconColor }) => (
                            <a
                                key={platform}
                                href={link}
                                target="_blank"
                                className={`${bg} border ${border} rounded-xl p-3 flex flex-col gap-2 hover:scale-105 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer`}
                            >
                                <span className={iconColor}>{icon}</span>
                                <div>
                                    <p className="text-xs font-medium text-gray-300">{platform}</p>
                                    <p className="text-[10px] text-gray-600">{handle}</p>
                                </div>
                            </a>
                        ))}
                    </div>
                </div>

                {/* Contact form */}
                <div className="col-span-1 md:col-span-1 xl:col-span-8 bg-[#13121c] border border-[#2a2840] rounded-2xl p-6 hover:-translate-y-1 transition-transform duration-300">
                    <p className="text-xs tracking-widest uppercase text-gray-600 mb-5">Send a Message</p>
                    <form action={handleSubmit} className="flex flex-col gap-4">
                        <input
                            type="text"
                            name="name"
                            placeholder="Your name"
                            className="bg-[#1e1c2e] border border-[#2a2840] text-gray-300 text-sm px-4 py-3 rounded-xl placeholder:text-gray-600 focus:outline-none focus:border-violet-500 transition-colors"
                        />
                        <textarea
                            name="message"
                            placeholder="What's on your mind?"
                            rows={4}
                            className="bg-[#1e1c2e] border border-[#2a2840] text-gray-300 text-sm px-4 py-3 rounded-xl placeholder:text-gray-600 focus:outline-none focus:border-violet-500 transition-colors resize-none"
                        />
                        <button
                            type="submit"
                            className="self-start bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium px-6 py-2.5 rounded-full transition-colors duration-200 cursor-pointer"
                        >
                            Send Message →
                        </button>
                    </form>
                </div>

                {/* Location */}
                <div className="col-span-1 xl:col-span-3 bg-[#13121c] border border-[#2a2840] rounded-2xl p-6 flex flex-col justify-between min-h-[150px] hover:-translate-y-1 transition-transform duration-300">
                    <div className="flex items-center gap-2">
                        <IoLocationSharp size={14} className="text-violet-400" />
                        <p className="text-xs tracking-widest uppercase text-gray-600">Location</p>
                    </div>
                    <div>
                        <p className="text-2xl font-extrabold text-white">California</p>
                        <p className="text-sm text-gray-500 mt-1">USA · PST · UTC−8</p>
                    </div>
                    <p className="text-xs text-gray-700">Open to Remote Worldwide</p>
                </div>

                {/* Status */}
                <div className="col-span-1 xl:col-span-3 bg-[#0f1a14] border border-[#1a2e20] rounded-2xl p-6 flex flex-col justify-between min-h-[150px] hover:-translate-y-1 transition-transform duration-300">
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <p className="text-xs tracking-widest uppercase text-gray-600">Status</p>
                    </div>
                    <p className="text-2xl font-extrabold text-emerald-400">Open to Work</p>
                    <p className="text-xs text-gray-600">Freelance · Full-time · Contract</p>
                </div>

                {/* Response time */}
                <div className="col-span-1 xl:col-span-3 bg-[#13121c] border border-[#2a2840] rounded-2xl p-6 flex flex-col justify-between min-h-[150px] hover:-translate-y-1 transition-transform duration-300">
                    <p className="text-xs tracking-widest uppercase text-gray-600">Response Time</p>
                    <p className="text-5xl font-extrabold text-white tracking-tight">&lt;24h</p>
                    <p className="text-xs text-gray-600">I reply fast, promise</p>
                </div>

                {/* Virtual coffee */}
                <div className="col-span-1 xl:col-span-3 bg-[#16131a] border border-[#2a2840] rounded-2xl p-6 flex flex-col justify-between min-h-[150px] hover:-translate-y-1 transition-transform duration-300">
                    <p className="text-xs tracking-widest uppercase text-gray-600">Prefer a chat?</p>
                    <div>
                        <p className="text-xl font-bold text-gray-300">Virtual coffee</p>
                        <p className="text-sm text-gray-600 mt-1">always on ☕</p>
                    </div>
                    <a
                        href={`mailto:${EMAIL}?subject=Virtual Coffee`}
                        className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
                    >
                        Let&apos;s chat →
                    </a>
                </div>

            </div>
        </div>
    )
}
