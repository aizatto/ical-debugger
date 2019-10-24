import React, { useState, ChangeEvent, useEffect } from 'react';
import { Input, Container, Col, Row, Card, CardTitle, CardSubtitle, CardBody } from 'reactstrap';
import uuid from "uuid/v4";
import * as dateFns from 'date-fns';
// @ts-ignore
import ical2json from 'ical2json';
const iCalDateParser = require('ical-date-parser');


interface Calendar {
  id: string,
  enabled: boolean,
  url: string,
}

interface iCalData {
  id: string,
  url: string,
  success: boolean,
  text: string | null,
}

interface VEVENT {
  CREATED: string,
  DESCRIPTION: string,
  DTEND: string,
  DTSTART: string,
  DTSTAMP: string,
  SEQUENCE: string,
  SUMMARY: string,
  UID: string,
  VALARM: {
    ACTION: string,
    DESCRIPTION: string,
    "TRIGGER;VALUE=DATE-TIME": string,
  }[] | null,
}

function getCalendarInLocalStorage(): Calendar[] {
  const json = localStorage.getItem('calendars');
  if (!json) {
    throw new Error(`Does not exist`);
  }

  return JSON.parse(json);
}

const END = 3;

async function fetchCalendars(calendars: Calendar[], setData: (newData: iCalData[]) => void): Promise<void> {
  const promises = calendars.map(async (calendar) => {
    let text = null;

    try {
      const response = await fetch(calendar.url);
      text = await response.text();
    } catch (error) {

    }

    return {
      id: calendar.id,
      url: calendar.url,
      success: text !== null,
      text,
    };
  })

  const newData = await Promise.all(promises);
  setData(newData);
}

const App: React.FC = () => {
  const [calendars, setCalendars] = useState<Calendar[]>(() => {
    try {
      return getCalendarInLocalStorage()
        .filter(calendar => calendar !== null);
    } catch (_error) {
      // console.error(_error);
    }
    return [
      {
        id: uuid(),
        enabled: false,
        url: '',
      }
    ];
  });

  const [data, setData] = useState<iCalData[]>([]);
  const [start, setStart] = useState(dateFns.startOfDay(new Date()));
  const [end, setEnd] = useState(dateFns.endOfDay(dateFns.addDays(start, END)));

  function setCalendarsInLocalStorage(calendars: Calendar[]): void {
    const json = JSON.stringify(calendars);
    localStorage.setItem('calendars', json);
    setCalendars(calendars);
  }

  const calendarsElement = calendars.map((calendar, index) => {
    const lastRow = index === calendars.length - 1;
    let deleteElement = null;

    const onChange = (e: ChangeEvent<HTMLInputElement>): void => {
      const newCalendars = calendars.slice(0);
      if (lastRow) {
        newCalendars.push({
          id: uuid(),
          enabled: false,
          url: '',
        });
      } else {
        newCalendars[index].url = e.target.value;
      }
      // setCalendars(newCalendars);
      setCalendarsInLocalStorage(newCalendars);
    };

    if (!lastRow) {
      const onClickToDelete = (): void => {
        const newCalendars = calendars.slice(0);
        delete newCalendars[index];
        // setCalendars(newCalendars);
        setCalendarsInLocalStorage(newCalendars);
      };

      deleteElement = <span onClick={onClickToDelete}>Delete</span>;
    }

    return (
      <tr key={calendar.id}>
        <td>
          <Input
            type="checkbox"
            defaultChecked={calendar.enabled}
            onChange={(e) => {
              const newCalendars = calendars.slice(0);
              newCalendars[index].enabled = e.target.checked;
              setCalendarsInLocalStorage(newCalendars);
            }}
          />
        </td>
        <td>
          <Input
            required={!lastRow}
            key={calendar.id}
            type="url"
            defaultValue={calendar.url}
            placeholder="https://"
            onChange={(e) => onChange(e)}
          />
        </td>
        <td>
          {deleteElement}
        </td>
      </tr>
    )
  });

  useEffect(() => {
    const validCalendars = calendars.filter((calendar) =>
      calendar.enabled === true && calendar.url.startsWith("http")
    )

    fetchCalendars(validCalendars, setData);
  }, [calendars])

  const veventsAll: { calendar: string, vevent: VEVENT}[] = [];

  data
    .filter(ical => ical.success)
    .map(ical => {
    const json = ical2json.convert(ical.text);
    veventsAll.push(...json.VCALENDAR[0]['VEVENT'].map((vevent: VEVENT) => {
      return {
        calendar: ical.id,
        vevent,
      }
    }))
  })

  let now = start;

  // let veventsByDay: { day: Date, vevents: VEVENT[] }[] = [];
  let cols = [];

  while (now.getTime() < end.getTime()) {
    let day = new Date(now);
    let endOfDay = dateFns.endOfDay(now);

    // TODO: doesn't handle repeat
    const vevents = veventsAll.filter(({vevent}) => 
      dateFns.areIntervalsOverlapping(
        { start: day, end: endOfDay },
        { start: iCalDateParser(vevent.DTSTART), end: iCalDateParser(vevent.DTEND) },
      )
    ).map(({vevent}) => vevent);

    const format = dateFns.format(day, 'yyyy-MM-dd');

    const events = vevents.map((vevent) => {
      const start = iCalDateParser(vevent.DTSTART);
      const end = iCalDateParser(vevent.DTEND);
      const description = vevent.DESCRIPTION ? <p>{vevent.DESCRIPTION}</p> : null;

      let alarms: React.ReactNode = (vevent['VALARM'] ? vevent['VALARM'] : []).map((alarm, index) => {
        return (
          <li key={`${vevent.UID}:alarm:${index}`}>
            action: {alarm.ACTION}
            <p>
              {alarm.DESCRIPTION}
            </p>
            Trigger: {alarm['TRIGGER;VALUE=DATE-TIME']}
          </li>
        )
      });

      alarms = alarms ? <div>Alarms:<ol>{alarms}</ol></div> : null;

      return (
        <Card key={`${format}:${vevent.UID}`} className="mb-1">
          <CardBody>
            <CardTitle>
              {vevent.SUMMARY}
            </CardTitle>
            <CardSubtitle>
              {dateFns.format(start, 'HH:mm')} -
              {dateFns.format(end, 'HH:mm')}
            </CardSubtitle>
            {description}
            {alarms}
          </CardBody>
        </Card>
      )
    });

    cols.push(
      <Col key={format}>
        <div>{format} {dateFns.format(day, 'iiii')}</div>
        {events}
      </Col>
    );

    // veventsByDay.push({
    //   day,
    //   vevents,
    // })

    now = dateFns.addDays(now, 1);
  }

  return (
    <div className="App">
      <Container>
        <table className="table">
          <tbody>
            {calendarsElement}
          </tbody>
        </table>
      </Container>
      <Row>
        {cols}
      </Row>
    </div>
  );
}

export default App;
