/** 図の要素から用語カードへのリンク。Atom がなければ undefined */
export type AtomLink = (atomId: string) => { href: string; title: string } | undefined;
