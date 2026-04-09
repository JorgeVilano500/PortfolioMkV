"use client"
import { ComingSoon, Navbar } from "@/components"

export default function Blog() {


    return (
        <div className="flex flex-col min-h-screen font-dm p-6 md:p-8 bg-[#0a0a0f]">
            <Navbar currentLink="Blog" />
            
            <div className="min-h-screen flex justify-center items-center italic">
                <ComingSoon />
            </div>
        </div>
    )
}