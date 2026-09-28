export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="footer__inner">
        <p className="footer__note">
          &copy; {year} AgriDirect Ethiopia. Smart Agricultural Marketplace.
        </p>
        <nav className="footer__links" aria-label="Footer">
          <a className="footer__link" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer noopener">
            Map data &copy; OpenStreetMap
          </a>
          <a className="footer__link" href="/settings">
            Settings
          </a>
        </nav>
      </div>
    </footer>
  );
}
