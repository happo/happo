import { createElement, ReactNode } from 'react';
import styled from 'styled-components';

const StyledButton = styled.button`
  font-size: 1.5em;
  text-align: center;
  color: palevioletred;
`;

interface ButtonProps {
  children: ReactNode;
}

export default function Button({ children }: ButtonProps) {
  return createElement(StyledButton, null, 'hello ', children);
}
