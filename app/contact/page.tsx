"use client"
import { Navbar, ComingSoon } from "@/components"

export default function Contact() {

    return (
        <div className="flex flex-col min-h-screen font-dm p-6 md:p-8 bg-[#0a0a0f]">
            <Navbar currentLink="Contact" />
            
            <div className="min-h-screen flex justify-center items-center italic">
                <ComingSoon />
            </div>
    </div>
    )
}