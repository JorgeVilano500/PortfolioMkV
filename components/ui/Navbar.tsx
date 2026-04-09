import Link from "next/link";

type NabarType = {
    currentLink: string
}

export function Navbar({currentLink}: NabarType) {
    const NavbarLinks = ["work", "about", "blog", "contact"]


    return (

        <div className="flex flex-row justify-between p-12">

            <Link href="/" className="text-2xl font-bold">
                JAVA.dev
            </Link>
            <ul className="hidden md:flex lg:flex flex-row gap-6 md:gap-8  list-none ">
                {
                    NavbarLinks.map((link, i) => (
                      <li key={link}>
                          <Link className={`${link === currentLink.toLowerCase() ? "text-[#7c6dff] capitalize":"text-[#888] hover:text-white capitalize "} `} href={`/${link}`}>
                            {link}
                        </Link>
                      </li>
                    ))
                }
         
            </ul>

        </div>
    )

}