import Image from "next/image";
import Bureau, { StatusLed } from "@/components/Bureau";
import MediaSlot from "@/components/MediaSlot";

export default function Home() {
  return (
    <>
      <header className="topbar">
        <div className="brand">
          {/* Agent mascot — replace public/media/agent.jpg */}
          <div className="avatar">
            <Image src="/media/agent.jpg" alt="Pixel-art secret agent mascot" width={96} height={96} priority />
          </div>
          <div>
            <p className="eyebrow">EST. 1984 // CLEARANCE LEVEL: ULTRA</p>
            <h1 className="glitch" data-text="RETRO INTELLIGENCE BUREAU">RETRO INTELLIGENCE BUREAU</h1>
            <p className="tagline">
              AI field agent • vector archives • zero nonsense<span className="cursor">_</span>
            </p>
          </div>
        </div>
        <StatusLed />
      </header>

      <main>
        {/* MEDIA SLOT 01 — hero banner (16:9). Replace public/media/hero.jpg with your own cartoon/GIF */}
        <section className="hero">
          <div className="hero-media">
            <MediaSlot src="/media/hero.jpg" alt="Pixel-art 1980s spy headquarters with a glowing green CRT terminal"
                       label="SLOT 01 // hero.jpg (16:9)" ratio="16 / 9" priority />
            <span className="stamp" aria-hidden="true">TOP SECRET</span>
          </div>
          <div className="pixel-box hero-copy">
            <h2>MISSION BRIEFING</h2>
            <ol className="steps">
              <li><span>01</span> Feed the bureau your case files.</li>
              <li><span>02</span> Files are shredded into chunks &amp; turned into vectors.</li>
              <li><span>03</span> Ask a question. Agent K-8 pulls the evidence &amp; reports.</li>
            </ol>
            <p className="tech">GO · CHI · POSTGRES + PGVECTOR · GEMINI · NEXT.JS</p>
          </div>
        </section>

        <Bureau />

        {/* MEDIA GALLERY — drop your own cartoons / GIFs into public/media as slot-1.gif, slot-2.gif, slot-3.gif */}
        <section aria-labelledby="gal-h">
          <h2 id="gal-h" className="section-title">▶ FIELD PHOTOS</h2>
          <div className="gallery">
            <MediaSlot src="/media/slot-1.mp4" alt="Field photo A" label="SLOT 03 // slot-1.gif" ratio="4 / 3" caption="EXHIBIT A" />
            <MediaSlot src="/media/slot-2.mp4" alt="Field photo B" label="SLOT 04 // slot-2.gif" ratio="4 / 3" caption="EXHIBIT B" />
            <MediaSlot src="/media/slot-3.mp4" alt="Field photo C" label="SLOT 05 // slot-3.gif" ratio="4 / 3" caption="EXHIBIT C" />
          </div>
        </section>
      </main>

      <footer className="footer">
        <p>
          © 1984–2026 RETRO INTELLIGENCE BUREAU • BUILT WITH GO BY{" "}
          <a href="https://github.com/rahuldev403">@RAHULDEV403</a>
        </p>
        <p className="dim">THIS TERMINAL WILL SELF-DESTRUCT IN ... JUST KIDDING.</p>
      </footer>
    </>
  );
}
