"use client"
import { useState } from "react";
import Link from "next/link";
import {RxHamburgerMenu, RxExit} from 'react-icons/rx'

type NabarType = {
    currentLink: string
}

export function Navbar({currentLink}: NabarType) {
    const NavbarLinks = ["work", "about", "blog", "contact"]

    const [isOpen, setIsOpen] = useState<boolean>(false)

    const toggleSidebar = () : void => {
        setIsOpen((!isOpen))
    }

    return (
        <div className={`flex flex-row justify-between ${currentLink.toLowerCase() === "work" ? "" : "mb-16 md:mb-0 lg:mb-0"} p-8 lg:p-12 md:p-12`}>


            <Link href="/" className={`${currentLink === "/" ? "text-[#7c6dff] ":"text-[#888] hover:text-white  "} text-2xl font-bold`}>
                JAVA.dev
            </Link>
            <ul className="hidden md:flex lg:flex flex-row gap-6 md:gap-8  list-none ">
                {
                    NavbarLinks.map((link, i) => (
                      <li key={link}>
                          <Link className={`${link === currentLink.toLowerCase() ? "text-[#7c6dff] ":"text-[#888] hover:text-white  "} capitalize`} href={`/${link}`}>
                            {link}
                        </Link>
                      </li>
                    ))
                }
         
            </ul>

            <section className="flex md:hidden lg:hidden self-center">

                <button onClick={toggleSidebar} className="m-1 border border-transparent p-1 transition ease-in hover:text-slate-400 hover:bg-slate-200 rounded-[1rem]">
                    <RxHamburgerMenu className="self-center" />
                </button>

                <div className={`${isOpen ? "translate-x-0" : "-translate-x-full"} bg-[#0a0a0f] fixed z-8 top-0 left-0 h-full flex flex-row  text-slate-500 shadow-lg transform transition-duration duration-400 ease-in-out w-full `}>
                    <button className="p-2 bg-red-400 text-white rounded absolute top-4 right-4" onClick={toggleSidebar}>
                        <RxExit />
                    </button>
                    <nav className="p-12 text-2xl flex gap-6">
                        <ul >
                            <li>
                                <Link className={`${currentLink === "/" ? "text-[#7c6dff] font-extrabold" : "font-bold text-[#888] hover:text-white" } capitalize`} href={'/'}>Home</Link>
                            </li>
                            {
                                NavbarLinks.map((link) => (
                                    <li key={link}>
                                        <Link className={`${link === currentLink.toLowerCase() ? "text-[#7c6dff] font-extrabold" : "font-bold text-[#888] hover:text-white" } capitalize`} href={`/${link}`}>
                                            {link}
                                        </Link>
                                    </li>
                                ))
                            }
                        </ul>
                    </nav>
                </div>

            </section>

        </div>
    )

}