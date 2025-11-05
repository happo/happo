import happoStatic from '../index.ts';

happoStatic.init();

happoStatic.registerExample({
  component: 'Hello',
  variant: 'red',
  render: () => {
    document.body.innerHTML = '<div style="background-color:red">Hello</div>';
  },
});

happoStatic.registerExample({
  component: 'Hello',
  variant: 'blue',
  render: () => {
    document.body.innerHTML = '<div style="background-color:blue">Hello</div>';
  },
});
