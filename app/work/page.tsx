"use client"
import { Navbar, WorkComponent  } from "@/components"


export default function Work() {


    return (
        <div className="min-h-screen bg-[#0a0a0f] font-dm p-6 md:p-8">
             <nav className="">
                <Navbar currentLink="Work" />
            </nav>
            <WorkComponent />

        </div>
    )
}