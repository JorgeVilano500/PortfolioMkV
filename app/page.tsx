import { Navbar, HomeComponent } from "@/components";

export default function Home() {
  return (
    <div className="min-h-screen  bg-[#0a0a0f] p-8 font-sans">
      <header className="">
        <Navbar currentLink="/" />
      </header>
      <HomeComponent />
    </div>
  );
}
