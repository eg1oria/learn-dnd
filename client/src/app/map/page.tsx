'use client';

import { useEffect, useState } from 'react';

export default function NameLogo() {
  const [show, setShow] = useState(false);
  const [cre, setCre] = useState(1);

  const handleEffect = () => {
    setCre((prev) => prev + 1);
  };
  useEffect(() => {
    const timer = setTimeout(() => {
      setShow((prev) => !prev);
    }, 1000);

    return () => clearTimeout(timer);
  }, [cre]);

  return (
    <div className="">
      {show ? <p className="">Ghbdtn</p> : null}
      <button onClick={handleEffect}>dslksdjf</button>
    </div>
  );
}
