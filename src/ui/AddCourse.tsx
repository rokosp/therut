import { useState } from 'react';
import { Modal, Pressable, TextInput, View } from 'react-native';

import { addCourse, type NewCourse } from '@/lib/api';
import { useAction } from '@/lib/useLoad';
import { Button, Card, ErrorText, Field, Row, Screen, Segmented, T } from '@/ui/components';
import { fonts, radius, space, usePalette } from '@/ui/theme';

type TeeDraft = { name: string; rating: string; slope: string; lengths: string[] };

const blankTee = (name: string, holes: number): TeeDraft => ({
  name,
  rating: '',
  slope: '',
  lengths: Array(holes).fill(''),
});

/** Resize a per-hole list when switching between 9 and 18 holes. */
const fit = <V,>(xs: V[], n: number, fill: V) =>
  xs.length >= n ? xs.slice(0, n) : [...xs, ...Array(n - xs.length).fill(fill)];

/**
 * Add a course by hand. Step 1 is the basics (name, place, holes, pars), then either Quick add
 * or Add full details (stroke index, tees with rating, slope and distances).
 */
export function AddCourseModal({
  visible,
  initialName,
  onClose,
  onSaved,
}: {
  visible: boolean;
  initialName: string;
  onClose: () => void;
  onSaved: (courseId: string) => void;
}) {
  const c = usePalette();
  const [step, setStep] = useState<'basics' | 'details'>('basics');
  const [name, setName] = useState(initialName);
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [holes, setHoles] = useState<9 | 18>(18);
  const [pars, setPars] = useState<number[]>(Array(18).fill(4));
  const [si, setSi] = useState<string[]>(Array(18).fill(''));
  const [tees, setTees] = useState<TeeDraft[]>([blankTee('White', 18)]);
  const save = useAction();
  const [seenName, setSeenName] = useState(initialName);

  // Opening again with a new search text starts a fresh form.
  if (visible && initialName !== seenName) {
    setSeenName(initialName);
    setName(initialName);
    setStep('basics');
  }

  const switchHoles = (n: 9 | 18) => {
    setHoles(n);
    setPars(fit(pars, n, 4));
    setSi(fit(si, n, ''));
    setTees(tees.map((t) => ({ ...t, lengths: fit(t.lengths, n, '') })));
  };
  const cyclePar = (i: number) => setPars(pars.map((p, j) => (j === i ? (p >= 6 ? 3 : p + 1) : p)));
  const total = pars.reduce((a, b) => a + b, 0);

  const basicsOk = name.trim().length >= 2;
  const done = (id: string) => {
    setStep('basics');
    onSaved(id);
  };

  const quickAdd = () =>
    save.run(async () => {
      if (!basicsOk) throw new Error('Give the course a name.');
      done(await addCourse({ name, city, country, holes, pars }));
    });

  const fullAdd = () =>
    save.run(async () => {
      if (!basicsOk) throw new Error('Give the course a name.');
      const siNums = si.map((x) => parseInt(x, 10));
      const anySi = si.some((x) => x.trim());
      if (anySi) {
        const sorted = [...siNums].sort((a, b) => a - b);
        if (sorted.some((v, i) => v !== i + 1))
          throw new Error(`Stroke index needs each number from 1 to ${holes} once.`);
      }
      const body: NewCourse = {
        name,
        city,
        country,
        holes,
        pars,
        stroke_index: anySi ? siNums : undefined,
        tees: tees
          .filter((t) => t.name.trim())
          .map((t) => ({
            name: t.name.trim(),
            course_rating: t.rating.replace(',', '.'),
            slope: t.slope,
            lengths: t.lengths.every((l) => l.trim()) ? t.lengths.map((l) => parseInt(l, 10) || null) : undefined,
          })),
      };
      done(await addCourse(body));
    });

  const cellStyle = {
    width: 34,
    height: 40,
    borderRadius: radius.small,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };
  const holeLabel = (i: number) => (
    <T variant="eyebrow" muted style={{ textAlign: 'center' }}>
      {i + 1}
    </T>
  );
  const numberCell = (value: string, onChange: (v: string) => void, maxLength = 2, width = 34) => (
    <TextInput
      value={value}
      onChangeText={(v) => onChange(v.replace(/[^0-9]/g, ''))}
      keyboardType="number-pad"
      maxLength={maxLength}
      selectTextOnFocus
      style={{
        ...cellStyle,
        width,
        textAlign: 'center',
        color: c.text,
        fontFamily: fonts.num,
        fontSize: 16,
        padding: 0,
        backgroundColor: c.bg,
      }}
    />
  );
  // Holes in rows of 9 so 18 fits on a phone.
  const nines = holes === 18 ? [0, 9] : [0];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <Screen>
        <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Pressable
            accessibilityLabel="Back"
            hitSlop={12}
            onPress={() => (step === 'details' ? setStep('basics') : onClose())}>
            <T style={{ fontSize: 22 }}>←</T>
          </Pressable>
          <T variant="h1">{step === 'basics' ? 'Add a course' : 'Full details'}</T>
          <View style={{ width: 22 }} />
        </Row>

        {step === 'basics' ? (
          <>
            <Card>
              <Field label="Course name" value={name} onChangeText={setName} placeholder="e.g. Royal Bled" />
              <Row style={{ gap: space.s }}>
                <View style={{ flex: 1 }}>
                  <Field label="Town" value={city} onChangeText={setCity} placeholder="e.g. Bled" />
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Country" value={country} onChangeText={setCountry} placeholder="e.g. Slovenia" />
                </View>
              </Row>
              <T variant="eyebrow" muted>
                Holes
              </T>
              <Segmented
                options={[
                  { value: 18, label: '18 holes' },
                  { value: 9, label: '9 holes' },
                ]}
                value={holes}
                onChange={switchHoles}
              />
            </Card>

            <Card>
              <Row style={{ justifyContent: 'space-between' }}>
                <T variant="title">Pars</T>
                <T variant="title">Par {total}</T>
              </Row>
              <T variant="label" muted>
                Tap a hole to change its par (3, 4, 5, 6).
              </T>
              {nines.map((start) => (
                <Row key={start} style={{ gap: 3, flexWrap: 'wrap' }}>
                  {pars.slice(start, start + 9).map((p, k) => (
                    <View key={start + k} style={{ gap: 2 }}>
                      {holeLabel(start + k)}
                      <Pressable
                        accessibilityLabel={`Hole ${start + k + 1}, par ${p}`}
                        onPress={() => cyclePar(start + k)}
                        style={{ ...cellStyle, backgroundColor: p === 4 ? 'transparent' : c.surface }}>
                        <T style={{ fontFamily: fonts.num, fontSize: 18 }}>{p}</T>
                      </Pressable>
                    </View>
                  ))}
                </Row>
              ))}
            </Card>

            <Button title="Quick add" kind="accent" onPress={quickAdd} busy={save.busy} disabled={!basicsOk} />
            <Button
              title="Add full details"
              kind="secondary"
              disabled={!basicsOk}
              onPress={() => {
                save.setError(null);
                setStep('details');
              }}
            />
            <T variant="label" muted>
              Quick add saves it now with just the pars. Full details adds stroke index, tees, ratings and distances,
              which make handicaps more accurate.
            </T>
            <ErrorText error={save.error} />
          </>
        ) : (
          <>
            <Card>
              <T variant="title">Stroke index</T>
              <T variant="label" muted>
                From the scorecard, 1 is the hardest hole. Leave empty if you don&apos;t know it.
              </T>
              {nines.map((start) => (
                <Row key={start} style={{ gap: 3, flexWrap: 'wrap' }}>
                  {si.slice(start, start + 9).map((v, k) => (
                    <View key={start + k} style={{ gap: 2 }}>
                      {holeLabel(start + k)}
                      {numberCell(v, (x) => setSi(si.map((y, j) => (j === start + k ? x : y))))}
                    </View>
                  ))}
                </Row>
              ))}
            </Card>

            {tees.map((t, ti) => {
              const setTee = (patch: Partial<TeeDraft>) =>
                setTees(tees.map((x, j) => (j === ti ? { ...x, ...patch } : x)));
              const totalLen = t.lengths.reduce((a, l) => a + (parseInt(l, 10) || 0), 0);
              return (
                <Card key={ti}>
                  <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <T variant="title">Tee {ti + 1}</T>
                    {tees.length > 1 ? (
                      <Pressable hitSlop={8} onPress={() => setTees(tees.filter((_, j) => j !== ti))}>
                        <T variant="label" style={{ color: c.accentText }}>
                          Remove
                        </T>
                      </Pressable>
                    ) : null}
                  </Row>
                  <Field label="Colour or name" value={t.name} onChangeText={(v) => setTee({ name: v })} />
                  <Row style={{ gap: space.s }}>
                    <View style={{ flex: 1 }}>
                      <Field
                        label="Course rating"
                        value={t.rating}
                        onChangeText={(v) => setTee({ rating: v.replace(/[^0-9.,]/g, '') })}
                        keyboardType="decimal-pad"
                        placeholder={holes === 18 ? '71.4' : '35.7'}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Field
                        label="Slope"
                        value={t.slope}
                        onChangeText={(v) => setTee({ slope: v.replace(/[^0-9]/g, '') })}
                        keyboardType="number-pad"
                        maxLength={3}
                        placeholder="128"
                      />
                    </View>
                  </Row>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <T variant="eyebrow" muted>
                      Distances in metres (optional)
                    </T>
                    {totalLen ? (
                      <T variant="eyebrow" muted>
                        {totalLen.toLocaleString('en-GB')} m
                      </T>
                    ) : null}
                  </Row>
                  {nines.map((start) => (
                    <Row key={start} style={{ gap: 3, flexWrap: 'wrap' }}>
                      {t.lengths.slice(start, start + 9).map((v, k) => (
                        <View key={start + k} style={{ gap: 2 }}>
                          {holeLabel(start + k)}
                          {numberCell(
                            v,
                            (x) => setTee({ lengths: t.lengths.map((y, j) => (j === start + k ? x : y)) }),
                            3,
                            34,
                          )}
                        </View>
                      ))}
                    </Row>
                  ))}
                </Card>
              );
            })}
            <Button
              title="Add another tee"
              kind="secondary"
              onPress={() =>
                setTees([...tees, blankTee(['Yellow', 'Red', 'Blue', 'Black'][tees.length - 1] ?? '', holes)])
              }
            />
            <Button title="Save course" kind="accent" onPress={fullAdd} busy={save.busy} />
            <ErrorText error={save.error} />
          </>
        )}
      </Screen>
    </Modal>
  );
}
