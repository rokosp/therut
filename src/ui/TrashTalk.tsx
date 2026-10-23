import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { deleteChat, displayName, getProfiles, listChat, postChat } from '@/lib/api';
import { useAction, useLoad } from '@/lib/useLoad';
import { Button, Card, ErrorText, Row, T } from '@/ui/components';
import { PlayerLink } from '@/ui/PlayerLink';
import { fonts, radius, space, usePalette } from '@/ui/theme';

const QUICK = ['🔥', '😂', '💀', '🐐', '🤡', '⛳', '🍮'];

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/** Comments and emoji on a match. Anyone who can see the match can chip in. */
export function TrashTalk({ matchId, userId }: { matchId: string; userId: string }) {
  const c = usePalette();
  const [text, setText] = useState('');
  const send = useAction();

  const { data, reload } = useLoad(
    async () => {
      const lines = await listChat(matchId);
      if (!lines) return null;
      const people = await getProfiles([...new Set(lines.map((l) => l.user_id))]);
      return { lines, people };
    },
    [matchId],
    { pollMs: 8000 },
  );
  // Before the database update, keep the section hidden.
  if (data === null) return null;

  const nameOf = (id: string) => displayName(data?.people.find((p) => p.id === id));
  const post = (body: string) =>
    send.run(async () => {
      if (!body.trim()) return;
      await postChat(matchId, body);
      setText('');
      await reload();
    });

  return (
    <Card>
      <T variant="title">Trash talk</T>
      {data?.lines.length ? (
        <View style={{ gap: space.s }}>
          {data.lines.map((l) => {
            const emojiOnly = [...l.body].length <= 3 && !/[a-z0-9]/i.test(l.body);
            return (
              <Row key={l.id} style={{ alignItems: 'flex-start', gap: space.s }}>
                <View style={{ flex: 1 }}>
                  <Row style={{ gap: space.xs }}>
                    <PlayerLink id={l.user_id}>
                      <T style={{ fontFamily: fonts.bodyBold }}>{nameOf(l.user_id)}</T>
                    </PlayerLink>
                    <T variant="label" muted>
                      {time(l.created_at)}
                    </T>
                  </Row>
                  <T style={emojiOnly ? { fontSize: 28, lineHeight: 34 } : undefined}>{l.body}</T>
                </View>
                {l.user_id === userId ? (
                  <Pressable
                    accessibilityLabel="Delete"
                    hitSlop={8}
                    onPress={() => send.run(async () => (await deleteChat(l.id), await reload()))}>
                    <T muted>×</T>
                  </Pressable>
                ) : null}
              </Row>
            );
          })}
        </View>
      ) : (
        <T muted>Quiet out here. Say something.</T>
      )}
      <Row style={{ flexWrap: 'wrap', gap: space.xs }}>
        {QUICK.map((e) => (
          <Pressable
            key={e}
            onPress={() => post(e)}
            accessibilityLabel={`Send ${e}`}
            style={{
              minWidth: 44,
              minHeight: 44,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.small,
              borderWidth: 1,
              borderColor: c.border,
            }}>
            <T style={{ fontSize: 22 }}>{e}</T>
          </Pressable>
        ))}
      </Row>
      <Row style={{ gap: space.s }}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Talk some trash"
          placeholderTextColor={c.muted}
          maxLength={280}
          onSubmitEditing={() => post(text)}
          style={{
            flex: 1,
            minHeight: 44,
            paddingHorizontal: space.m,
            borderWidth: 1,
            borderColor: c.border,
            borderRadius: radius.small,
            color: c.text,
            fontFamily: fonts.body,
            fontSize: 16,
          }}
        />
        <Button title="Send" kind="accent" onPress={() => post(text)} busy={send.busy} />
      </Row>
      <ErrorText error={send.error} />
    </Card>
  );
}
