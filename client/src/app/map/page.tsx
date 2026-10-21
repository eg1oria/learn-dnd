export default function NameLogo() {
  const name = 'Egor Leontev';

  const [first = '', last = ''] = name.split(' ');
  const nameLogo = [first[0], last[0]];

  return (
    <div>
      {nameLogo.map((letter, index) => (
        <span key={index}>{letter}</span>
      ))}
    </div>
  );
}
