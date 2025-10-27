import { createElement, useEffect, useState } from 'react';
import { AddonPanel } from 'storybook/internal/components';
import {
  addons,
  types,
  useChannel,
  useParameter,
  useStorybookState,
} from 'storybook/manager-api';

const ADDON_ID = 'happo';
const PANEL_ID = `${ADDON_ID}/panel`;

interface FunctionParam {
  key: string;
}

function HappoPanel() {
  const happoParams = useParameter('happo', null);
  const state = useStorybookState();
  const emit = useChannel({});
  const [functionParams, setFunctionParams] = useState<Array<FunctionParam>>([]);

  useEffect(() => {
    function listen(event: { params: Array<FunctionParam> }) {
      setFunctionParams(event.params);
    }

    addons.getChannel().on('happo/functions/params', listen);

    return () => {
      addons.getChannel().off('happo/functions/params', listen);
    };
  }, [state.storyId]);

  return createElement(
    'div',
    {
      style: {
        padding: 10,
        fontSize: 12,
      },
    },
    happoParams
      ? createElement(
          'table',
          null,
          createElement(
            'tbody',
            null,
            Object.keys(happoParams).map((key) => {
              const val = happoParams[key];

              return createElement(
                'tr',
                { key: key },
                createElement('td', null, createElement('code', null, `${key}:`)),
                createElement(
                  'td',
                  null,
                  createElement('code', null, JSON.stringify(val)),
                ),
              );
            }),
            functionParams.map((param) => {
              return createElement(
                'tr',
                { key: param.key },
                createElement(
                  'td',
                  null,
                  createElement('code', null, `${param.key}:`),
                ),
                createElement(
                  'td',
                  null,
                  createElement(
                    'button',
                    {
                      onClick: () =>
                        emit('happo/functions/invoke', {
                          storyId: state.storyId,
                          funcName: param.key,
                        }),
                    },
                    'Invoke',
                  ),
                ),
              );
            }),
          ),
        )
      : createElement('div', null, 'No happo params for this story'),
  );
}

addons.register(ADDON_ID, () => {
  addons.add(PANEL_ID, {
    type: types.PANEL,
    title: 'Happo',
    render: ({ active }) => {
      return createElement(AddonPanel, {
        active: active ?? false,
        children: createElement(HappoPanel, null),
      });
    },
  });
});
